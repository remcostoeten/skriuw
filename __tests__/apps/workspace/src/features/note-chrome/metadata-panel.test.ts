import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceNode, WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { MetadataPanel } from "@/features/note-chrome/metadata-panel";

function node(id: string, rank: number, createdAt: number): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: null,
    rank,
    title: id,
    icon: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    pinnedAt: null,
  };
}

function snapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "short",
    nodes: [node("short", 1, 1), node("long", 2, 2)],
    documents: [
      {
        noteId: "short",
        documentJson: { type: "doc", content: [] },
        markdown: "two words",
        revision: 1,
        wordCount: 2,
      },
      {
        noteId: "long",
        documentJson: { type: "doc", content: [] },
        markdown: "x".repeat(500),
        revision: 1,
        wordCount: 777,
      },
    ],
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "system",
      compactSidebar: false,
      showPageIcons: true,
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "Start writing",
    },
  };
}

test("the metadata panel shows the details of the note switched to", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = renderToStaticMarkup(createElement(MetadataPanel, { store }));
  assert.match(before, />9</);

  store.setActiveNote("long");
  const after = renderToStaticMarkup(createElement(MetadataPanel, { store }));
  assert.match(after, />777</);
  assert.match(after, />500</);
  assert.doesNotMatch(after, />9</);
});
