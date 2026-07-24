import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../src/contracts/workspace";
import { editorModeForNote, setEditorMode, toggleEditorMode } from "../../src/actions/editor-mode";
import { createInitialState, createRendererStore } from "../../src/store/store";

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

function snapshot(defaultRawMode = false): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "a",
    nodes: [node({ id: "a", kind: "note", rank: 1 }), node({ id: "b", kind: "note", rank: 2 })],
    documents: [],
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
      editorPlaceholder: "Start writing",
      editorDefaultRawMode: defaultRawMode,
    },
  };
}

function store(defaultRawMode = false) {
  return createRendererStore(createInitialState(snapshot(defaultRawMode)));
}

test("editorModeForNote defaults to rendered unless the setting flips it", () => {
  assert.equal(editorModeForNote(store().getState(), "a"), "rendered");
  assert.equal(editorModeForNote(store(true).getState(), "a"), "raw");
});

test("toggleEditorMode flips only the target note and is idempotent per call", () => {
  const renderer = store();
  toggleEditorMode(renderer, "a");
  assert.equal(editorModeForNote(renderer.getState(), "a"), "raw");
  assert.equal(editorModeForNote(renderer.getState(), "b"), "rendered");

  toggleEditorMode(renderer, "a");
  assert.equal(editorModeForNote(renderer.getState(), "a"), "rendered");
});

test("setEditorMode is a no-op when the note already has the requested mode", () => {
  const renderer = store();
  const before = renderer.getState();
  setEditorMode(renderer, "a", "rendered");
  assert.equal(renderer.getState(), before);
});
