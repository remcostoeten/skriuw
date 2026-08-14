import assert from "node:assert/strict";
import test from "node:test";
import type {
  NoteProperty,
  WorkspaceNode,
  WorkspaceSnapshot,
} from "../../../src/contracts/workspace";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_ROOT_ID,
} from "../../../src/features/journal/constants";
import { sameJournalEntries, selectJournalEntries } from "../../../src/features/journal/model";
import {
  entriesWithTag,
  journalEntryTagIds,
  projectJournalTags,
  tagIdsMatchingQuery,
} from "../../../src/features/journal/tags";
import type { ReferenceBootstrap, TagRecord } from "../../../src/features/references/types";
import { createInitialState } from "../../../src/store/store";
import { setupTauriInvokeStub } from "../../shared/tauri-stub";

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

function tag(id: string, name: string, color: string | null): TagRecord {
  return { id, name, color, createdAt: 1, updatedAt: 1, createdIn: null };
}

function bootstrap(): ReferenceBootstrap {
  return {
    tags: [tag("tag-run", "running", "#4d9d6e"), tag("tag-work", "work", null)],
    people: [],
    references: [
      {
        noteId: "entry-a",
        targets: [
          { kind: "tag", targetId: "tag-run" },
          { kind: "tag", targetId: "tag-run" },
          { kind: "tag", targetId: "tag-gone" },
          { kind: "person", targetId: "person-x" },
        ],
      },
      {
        noteId: "entry-b",
        targets: [
          { kind: "tag", targetId: "tag-work" },
          { kind: "tag", targetId: "tag-run" },
        ],
      },
      { noteId: "regular", targets: [{ kind: "tag", targetId: "tag-work" }] },
    ],
  };
}

function journalState() {
  return createInitialState(snapshot(), undefined, bootstrap());
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
      node({ id: "entry-c", kind: "note", parentId: JOURNAL_ROOT_ID, rank: 300 }),
    ],
    documents: [
      { noteId: "regular", documentJson: { type: "doc" }, markdown: "", revision: 1, wordCount: 3 },
      { noteId: "entry-a", documentJson: { type: "doc" }, markdown: "a", revision: 1, wordCount: 5 },
      { noteId: "entry-b", documentJson: { type: "doc" }, markdown: "b", revision: 1, wordCount: 4 },
      { noteId: "entry-c", documentJson: { type: "doc" }, markdown: "c", revision: 1, wordCount: 2 },
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
      dateProperty("entry-c", "2026-07-14"),
    ],
  };
}

test("journalEntryTagIds dedupes, keeps document order, and drops deleted tags", () => {
  const state = journalState();
  assert.deepEqual(journalEntryTagIds(state, "entry-a"), ["tag-run"]);
  assert.deepEqual(journalEntryTagIds(state, "entry-b"), ["tag-work", "tag-run"]);
  assert.deepEqual(journalEntryTagIds(state, "entry-c"), []);
});

test("journal entries carry their canonical tag ids", () => {
  const state = journalState();
  const entries = selectJournalEntries(state);
  assert.deepEqual(
    entries.map((entry) => [entry.noteId, [...entry.tagIds]]),
    [
      ["entry-c", []],
      ["entry-b", ["tag-work", "tag-run"]],
      ["entry-a", ["tag-run"]],
    ],
  );
});

test("sameJournalEntries separates entries that differ only by tags", () => {
  const state = journalState();
  const entries = selectJournalEntries(state);
  assert.ok(sameJournalEntries(entries, selectJournalEntries(state)));
  const retagged = entries.map((entry) =>
    entry.noteId === "entry-a" ? { ...entry, tagIds: ["tag-work"] } : entry,
  );
  assert.ok(!sameJournalEntries(entries, retagged));
});

test("projectJournalTags counts only journal entries, most used first", () => {
  const state = journalState();
  const tags = projectJournalTags(state.tags, selectJournalEntries(state));
  assert.deepEqual(
    tags.map((entry) => [entry.id, entry.name, entry.color, entry.entryCount]),
    [
      ["tag-run", "running", "#4d9d6e", 2],
      ["tag-work", "work", null, 1],
    ],
  );
});

test("projectJournalTags follows renames instead of stale copies", () => {
  const state = journalState();
  const entries = selectJournalEntries(state);
  const renamed = new Map(state.tags);
  renamed.set("tag-run", tag("tag-run", "trail-running", "#4d9d6e"));
  const tags = projectJournalTags(renamed, entries);
  assert.equal(tags[0]?.name, "trail-running");
  assert.equal(tags[0]?.entryCount, 2);
});

test("entriesWithTag returns the entries carrying a tag, newest first", () => {
  const state = journalState();
  const entries = selectJournalEntries(state);
  assert.deepEqual(
    entriesWithTag(entries, "tag-run").map((entry) => entry.dateKey),
    ["2026-07-12", "2026-07-10"],
  );
  assert.deepEqual(entriesWithTag(entries, "tag-gone"), []);
});

test("tagIdsMatchingQuery matches tag names case-insensitively", () => {
  const state = journalState();
  const tags = projectJournalTags(state.tags, selectJournalEntries(state));
  assert.deepEqual([...tagIdsMatchingQuery(tags, "runn")], ["tag-run"]);
  assert.deepEqual([...tagIdsMatchingQuery(tags, "wor")], ["tag-work"]);
  assert.deepEqual([...tagIdsMatchingQuery(tags, "zzz")], []);
});
