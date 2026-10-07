import assert from "node:assert/strict";
import { test } from "vitest";
import { setupTauriInvokeStub } from "../../shared/tauri-stub";

setupTauriInvokeStub();

const NOTE_SETTINGS = {
  settingsVersion: 1,
  theme: "system",
  compactSidebar: false,
  showPageIcons: true,
  rememberLastNote: true,
  editorFont: "sans",
  editorLineHeight: "1.6",
  showLineNumbers: false,
  editorPlaceholder: "",
};

function node(
  id: string,
  rank: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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
    ...overrides,
  };
}

function heading(text: string) {
  return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text }] };
}

function paragraph(text?: string) {
  return text === undefined
    ? { type: "paragraph" }
    : { type: "paragraph", content: [{ type: "text", text }] };
}

function document(noteId: string, markdown: string, blocks: unknown[]) {
  return {
    noteId,
    documentJson: { type: "doc", content: blocks },
    markdown,
    revision: 1,
    wordCount: 0,
  };
}

async function storeWith(snapshot: Record<string, unknown>) {
  const { createInitialState, createRendererStore } =
    await import("@skriuw/renderer-core/store/store");
  return createRendererStore(
    createInitialState({
      protocolVersion: 1,
      activeNoteId: null,
      documents: [],
      historyHeaders: [],
      settings: NOTE_SETTINGS,
      ...snapshot,
    } as never),
  );
}

test("findEmptyNoteIds reports blank notes and notes holding only their title", async () => {
  const { findEmptyNoteIds } = await import("@/features/notes/empty-notes");
  const store = await storeWith({
    nodes: [node("blank", 1), node("titled", 2), node("written", 3), node("other-heading", 4)],
    documents: [
      document("blank", "", [paragraph()]),
      document("titled", "# titled\n\n", [heading("titled"), paragraph()]),
      document("written", "Some words", [paragraph("Some words")]),
      document("other-heading", "# Plans", [heading("Plans")]),
    ],
  });

  assert.deepEqual(findEmptyNoteIds(store.getState()), ["blank", "titled"]);
});

test("findEmptyNoteIds leaves pinned, decorated, parent, journal and drawn notes alone", async () => {
  const { findEmptyNoteIds } = await import("@/features/notes/empty-notes");
  const { JOURNAL_ROOT_ID } = await import("@skriuw/renderer-core/journal/constants");
  const store = await storeWith({
    nodes: [
      node("pinned", 1, { pinnedAt: 5 }),
      node("iconed", 2, { icon: "📌" }),
      node("parent", 3),
      node("child", 4, { parentId: "parent" }),
      node(JOURNAL_ROOT_ID, 5, { kind: "folder" }),
      node("entry", 6, { parentId: JOURNAL_ROOT_ID }),
      node("drawn", 7),
      node("image", 8),
    ],
    documents: [
      document("pinned", "", [paragraph()]),
      document("iconed", "", [paragraph()]),
      document("parent", "", [paragraph()]),
      document("child", "Body", [paragraph("Body")]),
      document("entry", "", [paragraph()]),
      document("drawn", "```excalidraw\n{}\n```", [paragraph()]),
      document("image", "", [{ type: "image", attrs: { src: "blob:1" } }]),
    ],
  });

  assert.deepEqual(findEmptyNoteIds(store.getState()), []);
});

test("trashEmptyNotes trashes every empty note, moves off the open one, and undo restores them", async () => {
  const { restoreEmptyNotes, trashEmptyNotes } = await import("@/features/notes/empty-notes");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [node("a", 1), node("b", 2), node("keep", 3)],
    documents: [
      document("a", "", [paragraph()]),
      document("b", "# b", [heading("b")]),
      document("keep", "Body", [paragraph("Body")]),
    ],
  });

  const cleanup = await trashEmptyNotes(store);

  assert.deepEqual(cleanup.noteIds, ["a", "b"]);
  assert.equal(store.getState().nodes.has("a"), false);
  assert.equal(store.getState().nodes.has("b"), false);
  assert.equal(store.getState().activeNoteId, "keep");

  restoreEmptyNotes(store, cleanup);

  assert.equal(store.getState().nodes.has("a"), true);
  assert.equal(store.getState().nodes.has("b"), true);
});

test("trashEmptyNotes is a no-op when nothing is empty", async () => {
  const { trashEmptyNotes } = await import("@/features/notes/empty-notes");
  const store = await storeWith({
    activeNoteId: "keep",
    nodes: [node("keep", 1)],
    documents: [document("keep", "Body", [paragraph("Body")])],
  });

  const cleanup = await trashEmptyNotes(store);

  assert.deepEqual(cleanup.noteIds, []);
  assert.equal(store.getState().nodes.has("keep"), true);
});
