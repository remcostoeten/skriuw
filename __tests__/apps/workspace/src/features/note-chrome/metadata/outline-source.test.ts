import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceNode, WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { toggleEditorMode } from "@/features/editor/editor-mode";
import {
  planOutlineRebind,
  selectOutlineSource,
} from "@/features/note-chrome/metadata/outline-source";

function node(id: string, rank: number): WorkspaceNode {
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
    pinnedAt: null,
  };
}

function snapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "a",
    nodes: [node("a", 1), node("b", 2)],
    documents: [],
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
      editorDefaultRawMode: false,
    },
  };
}

function typeInto(store: RendererStore, noteId: string, markdown: string): void {
  store.update((current) => ({
    ...current,
    documents: new Map(current.documents).set(noteId, {
      noteId,
      documentJson: { type: "doc", content: [] },
      markdown,
      revision: (current.documents.get(noteId)?.revision ?? 0) + 1,
      wordCount: markdown.split(/\s+/).length,
      hasLosslessMarkdown: false,
    }),
  }));
}

function sourceHost(proseHostId: string | null) {
  return proseHostId === null ? null : { id: proseHostId };
}

test("a raw to rich swap on the same note rebinds the outline to the new editor host", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const richHost = sourceHost("first-rich-view");
  const initial = selectOutlineSource(store.getState());

  toggleEditorMode(store, "a");
  const raw = selectOutlineSource(store.getState());
  assert.notEqual(raw, initial);
  assert.equal(planOutlineRebind(richHost, sourceHost(null)), "remount");

  toggleEditorMode(store, "a");
  const rich = selectOutlineSource(store.getState());
  assert.notEqual(rich, raw);
  assert.equal(planOutlineRebind(null, sourceHost("second-rich-view")), "remount");
  assert.equal(planOutlineRebind(richHost, sourceHost("second-rich-view")), "remount");
});

test("typing leaves the outline source untouched so outline work stays off the keystroke path", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = selectOutlineSource(store.getState());

  typeInto(store, "a", "# Heading");
  typeInto(store, "a", "# Heading\n\nBody text");

  assert.equal(selectOutlineSource(store.getState()), before);
});

test("a note switch onto a still-mounted editor host only restarts the outline", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const host = sourceHost("shared-rich-view");
  const before = selectOutlineSource(store.getState());

  store.update((current) => ({ ...current, activeNoteId: "b" }));

  assert.notEqual(selectOutlineSource(store.getState()), before);
  assert.equal(planOutlineRebind(host, host), "restart");
});

test("no active note has no outline source", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.update((current) => ({ ...current, activeNoteId: null }));
  assert.equal(selectOutlineSource(store.getState()), null);
});
