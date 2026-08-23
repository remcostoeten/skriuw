import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../../src/contracts/workspace";
import {
  closeAnnotateMode,
  openAnnotateMode,
  toggleAnnotateMode,
} from "../../../src/store/actions/annotate-mode";
import { createInitialState, createRendererStore } from "../../../src/store/store";

function note(id: string, rank: number): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: null,
    rank,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  };
}

function snapshot(
  activeNoteId: string | null,
  nodes: WorkspaceNode[] = [note("note-a", 1), note("note-b", 2)],
): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId,
    nodes,
    documents: [],
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "midnight",
      compactSidebar: false,
      showPageIcons: true,
      reduceMotion: false,
      rememberLastNote: true,
      editorFont: "inter",
      editorLineHeight: "comfortable",
      showLineNumbers: true,
      editorPlaceholder: "Start writing...",
    },
  };
}

function storeWith(activeNoteId: string | null) {
  return createRendererStore(createInitialState(snapshot(activeNoteId)));
}

/** An empty workspace is the only way to have no active note to annotate. */
function emptyStore() {
  return createRendererStore(createInitialState(snapshot(null, [])));
}

test("a workspace starts outside annotate mode", () => {
  assert.equal(storeWith("note-a").getState().annotatingNoteId, null);
});

test("annotate mode names the note it is open on", () => {
  const store = storeWith("note-a");

  openAnnotateMode(store, "note-a");

  assert.equal(store.getState().annotatingNoteId, "note-a");
});

test("reopening the same note does not publish a new state", () => {
  const store = storeWith("note-a");
  openAnnotateMode(store, "note-a");
  const before = store.getState();

  openAnnotateMode(store, "note-a");

  assert.equal(store.getState(), before, "an unchanged mode must not re-render subscribers");
});

test("toggling opens on the active note and closes from anywhere", () => {
  const store = storeWith("note-b");

  toggleAnnotateMode(store);
  assert.equal(store.getState().annotatingNoteId, "note-b");

  toggleAnnotateMode(store);
  assert.equal(store.getState().annotatingNoteId, null);
});

test("toggling with no active note stays closed", () => {
  const store = emptyStore();

  toggleAnnotateMode(store);

  assert.equal(store.getState().annotatingNoteId, null);
});

test("closing an already-closed mode is a no-op", () => {
  const store = storeWith("note-a");
  const before = store.getState();

  closeAnnotateMode(store);

  assert.equal(store.getState(), before);
});

test("annotate mode follows the note it was opened on, not the active note", () => {
  const store = storeWith("note-a");
  openAnnotateMode(store, "note-a");

  openAnnotateMode(store, "note-b");

  assert.equal(store.getState().annotatingNoteId, "note-b");
});
