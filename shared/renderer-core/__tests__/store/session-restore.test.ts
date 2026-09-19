import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../src/contracts/workspace";
import type { PaneLayout } from "../../src/store/panes";
import { PRIMARY_PANE_ID, SECONDARY_PANE_ID } from "../../src/store/panes";
import { restoreSession } from "../../src/store/session-restore";
import { createInitialState } from "../../src/store/store";

function note(id: string, rank: number, deletedAt: number | null = null): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: null,
    rank,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt,
  };
}

function snapshot(
  activeNoteId: string | null,
  rememberLastNote = true,
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
      rememberLastNote,
      editorFont: "inter",
      editorLineHeight: "comfortable",
      showLineNumbers: true,
      editorPlaceholder: "Start writing...",
    },
  };
}

function layout(activeNoteId: string | null, openNoteIds: string[]): PaneLayout {
  return {
    panes: [
      { paneId: PRIMARY_PANE_ID, openNoteIds, pinnedNoteIds: [], activeNoteId },
    ],
    orientation: "horizontal",
    ratio: 0.7,
  };
}

test("a reload with no remembered note reopens the layout's active note", () => {
  const state = createInitialState(snapshot(null));
  assert.equal(state.activeNoteId, "note-a");

  const restored = restoreSession(state, layout("note-b", ["note-a", "note-b"]), null);
  assert.equal(restored.activeNoteId, "note-b");
  assert.equal(restored.focusedNodeId, "note-b");
  assert.equal(restored.panes[0]?.activeNoteId, "note-b");
  assert.deepEqual(restored.panes[0]?.openNoteIds, ["note-a", "note-b"]);
  assert.equal(restored.splitOrientation, "horizontal");
  assert.equal(restored.splitRatio, 0.7);
});

test("the workspace's remembered note outranks a stale layout", () => {
  const state = createInitialState(snapshot("note-a"));
  const restored = restoreSession(state, layout("note-b", ["note-a", "note-b"]), "note-a");
  assert.equal(restored.activeNoteId, "note-a");
  assert.equal(restored.panes[0]?.activeNoteId, "note-a");
});

test("disabled continuity restores the layout without reopening its note", () => {
  const state = createInitialState(snapshot(null, false));
  const restored = restoreSession(state, layout("note-b", ["note-a", "note-b"]), null);
  assert.equal(restored.activeNoteId, "note-a");
  assert.deepEqual(restored.panes[0]?.openNoteIds, ["note-a", "note-b"]);
  assert.equal(restored.splitRatio, 0.7);
});

test("a trashed or purged layout note falls back to the bootstrap selection", () => {
  const trashed = createInitialState(
    snapshot(null, true, [note("note-a", 1), note("note-b", 2, 5)]),
  );
  assert.equal(
    restoreSession(trashed, layout("note-b", ["note-a", "note-b"]), null).activeNoteId,
    "note-a",
  );

  const purged = createInitialState(snapshot(null));
  assert.equal(
    restoreSession(purged, layout("note-gone", ["note-gone"]), null).activeNoteId,
    "note-a",
  );
});

test("a split layout keeps its own pane while the primary pane drives the active note", () => {
  const state = createInitialState(snapshot(null));
  const split: PaneLayout = {
    panes: [
      {
        paneId: PRIMARY_PANE_ID,
        openNoteIds: ["note-b"],
        pinnedNoteIds: [],
        activeNoteId: "note-b",
      },
      {
        paneId: SECONDARY_PANE_ID,
        openNoteIds: ["note-a"],
        pinnedNoteIds: [],
        activeNoteId: "note-a",
      },
    ],
    orientation: "vertical",
    ratio: 0.5,
  };

  const restored = restoreSession(state, split, null);
  assert.equal(restored.activeNoteId, "note-b");
  assert.equal(restored.panes[1]?.activeNoteId, "note-a");
});
