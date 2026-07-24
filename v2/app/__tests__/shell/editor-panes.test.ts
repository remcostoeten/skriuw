import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceSnapshot } from "../../src/contracts/workspace";
import { EditorPanes } from "../../src/shell/editor-panes";
import { openBeside, openNoteInTab } from "../../src/actions/panes";
import { SECONDARY_PANE_ID } from "../../src/store/panes";
import { createInitialState, createRendererStore } from "../../src/store/store";

function snapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "note-a",
    nodes: [
      {
        id: "note-a",
        parentId: null,
        kind: "note",
        rank: 1,
        title: "A",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
      {
        id: "note-b",
        parentId: null,
        kind: "note",
        rank: 2,
        title: "B",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
      {
        id: "note-trashed",
        parentId: null,
        kind: "note",
        rank: 3,
        title: "Trashed",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: 5,
      },
    ],
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

function editorHostCount(html: string): number {
  return (html.match(/class="editor-host"/g) ?? []).length;
}

test("a single pane with multiple tabs mounts exactly one live editor host", () => {
  const store = createRendererStore(createInitialState(snapshot(), []));
  openNoteInTab(store, "note-b");
  const html = renderToStaticMarkup(createElement(EditorPanes, { store }));
  assert.equal(editorHostCount(html), 1);
});

test("a split view mounts exactly two live editor hosts", () => {
  const store = createRendererStore(createInitialState(snapshot(), []));
  openBeside(store, "note-b");
  const html = renderToStaticMarkup(createElement(EditorPanes, { store }));
  assert.equal(editorHostCount(html), 2);
});

test("a note trashed while open in the secondary pane degrades visibly instead of crashing", () => {
  const store = createRendererStore(createInitialState(snapshot(), []));
  openBeside(store, "note-b");
  // Simulate the split's note being trashed elsewhere without going through the
  // action layer, which already refuses to open unavailable notes beside.
  store.update((current) => ({
    ...current,
    panes: [
      current.panes[0]!,
      {
        paneId: SECONDARY_PANE_ID,
        openNoteIds: ["note-trashed"],
        pinnedNoteIds: [],
        activeNoteId: "note-trashed",
      },
    ],
  }));
  assert.doesNotThrow(() => {
    const html = renderToStaticMarkup(createElement(EditorPanes, { store }));
    assert.equal(editorHostCount(html), 2);
    assert.match(html, /This note is no longer available/);
  });
});
