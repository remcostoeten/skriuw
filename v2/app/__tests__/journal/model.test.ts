import assert from "node:assert/strict";
import test from "node:test";
import type {
  NoteProperty,
  WorkspaceNode,
  WorkspaceSnapshot,
} from "../../src/contracts/workspace";
import { ensureJournalEntry, setJournalMood } from "../../src/journal/actions";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_MOOD_PROPERTY_ID,
  JOURNAL_ROOT_ID,
} from "../../src/journal/constants";
import {
  journalEntryMood,
  journalNoteIdForDate,
  selectEntryDateKeys,
  selectJournalEntries,
} from "../../src/journal/model";
import { createInitialState, createRendererStore } from "../../src/store/store";
import { setupTauriInvokeStub } from "../shared/tauri-stub";

setupTauriInvokeStub();

function node(partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind">): WorkspaceNode {
  return {
    parentId: null,
    rank: 0,
    title: partial.id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
    ...partial,
  };
}

function dateProperty(noteId: string, dateKey: string): NoteProperty {
  return {
    noteId,
    id: JOURNAL_DATE_PROPERTY_ID,
    name: "Date",
    value: { valueVersion: 1, type: "date", value: dateKey },
    options: [],
    position: 0,
  };
}

function snapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "regular",
    nodes: [
      node({ id: "regular", kind: "note", rank: 100 }),
      node({ id: JOURNAL_ROOT_ID, kind: "folder", rank: 200, title: "Journal" }),
      node({ id: "entry-a", kind: "note", parentId: JOURNAL_ROOT_ID, rank: 100 }),
      node({ id: "entry-b", kind: "note", parentId: JOURNAL_ROOT_ID, rank: 200 }),
      node({ id: "entry-empty", kind: "note", parentId: JOURNAL_ROOT_ID, rank: 300 }),
    ],
    documents: [
      { noteId: "regular", documentJson: { type: "doc" }, markdown: "", revision: 1, wordCount: 3 },
      { noteId: "entry-a", documentJson: { type: "doc" }, markdown: "a", revision: 1, wordCount: 5 },
      { noteId: "entry-b", documentJson: { type: "doc" }, markdown: "b", revision: 1, wordCount: 0 },
      { noteId: "entry-empty", documentJson: { type: "doc" }, markdown: "", revision: 1, wordCount: 0 },
    ],
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "system",
      compactSidebar: false,
      showPageIcons: true,
      reduceMotion: false,
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "",
    },
    tags: [],
    people: [],
    references: [],
    properties: [
      dateProperty("entry-a", "2026-07-10"),
      dateProperty("entry-b", "2026-07-12"),
      {
        noteId: "entry-b",
        id: JOURNAL_MOOD_PROPERTY_ID,
        name: "Mood",
        value: { valueVersion: 1, type: "select", value: "good" },
        options: [
          { id: "great", label: "Great", color: "green" },
          { id: "good", label: "Good", color: "teal" },
          { id: "neutral", label: "Neutral", color: "gray" },
          { id: "low", label: "Low", color: "amber" },
          { id: "rough", label: "Rough", color: "red" },
        ],
        position: 1,
      },
      dateProperty("entry-empty", "2026-07-15"),
    ],
  };
}

test("the journal subtree stays out of the tree rows and note navigation", () => {
  const state = createInitialState(snapshot());
  assert.ok(!state.visibleIds.includes(JOURNAL_ROOT_ID));
  assert.ok(!state.visibleIds.includes("entry-a"));
  assert.deepEqual(state.noteIds, ["regular"]);
  assert.ok(state.metadata.has("entry-a"));
  assert.ok(state.nodes.has("entry-a"));
});

test("selectJournalEntries keeps dated entries with words or mood, newest first", () => {
  const state = createInitialState(snapshot());
  const entries = selectJournalEntries(state);
  assert.deepEqual(
    entries.map((entry) => [entry.noteId, entry.dateKey, entry.mood, entry.wordCount]),
    [
      ["entry-b", "2026-07-12", "good", 0],
      ["entry-a", "2026-07-10", null, 5],
    ],
  );
  assert.deepEqual([...selectEntryDateKeys(state)].sort(), ["2026-07-10", "2026-07-12"]);
});

test("journalNoteIdForDate also finds still-empty entries", () => {
  const state = createInitialState(snapshot());
  assert.equal(journalNoteIdForDate(state, "2026-07-15"), "entry-empty");
  assert.equal(journalNoteIdForDate(state, "2026-07-10"), "entry-a");
  assert.equal(journalNoteIdForDate(state, "2026-07-11"), null);
});

test("ensureJournalEntry creates the hidden folder and a dated note without stealing focus", () => {
  const bare: WorkspaceSnapshot = { ...snapshot(), nodes: [snapshot().nodes[0]!], properties: [] };
  const store = createRendererStore(createInitialState(bare));
  const activeBefore = store.getState().activeNoteId;
  const noteId = ensureJournalEntry(store, "2026-07-27");
  const state = store.getState();
  assert.equal(state.sourceNodes.get(JOURNAL_ROOT_ID)?.kind, "folder");
  assert.equal(state.sourceNodes.get(noteId)?.parentId, JOURNAL_ROOT_ID);
  assert.equal(journalNoteIdForDate(state, "2026-07-27"), noteId);
  assert.equal(state.activeNoteId, activeBefore);
  assert.ok(!state.visibleIds.includes(JOURNAL_ROOT_ID));
  assert.equal(ensureJournalEntry(store, "2026-07-27"), noteId);
});

test("setJournalMood writes, replaces, and clears the mood property", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  setJournalMood(store, "entry-a", "rough");
  assert.equal(journalEntryMood(store.getState(), "entry-a"), "rough");
  setJournalMood(store, "entry-a", "great");
  assert.equal(journalEntryMood(store.getState(), "entry-a"), "great");
  setJournalMood(store, "entry-a", null);
  assert.equal(journalEntryMood(store.getState(), "entry-a"), null);
});
