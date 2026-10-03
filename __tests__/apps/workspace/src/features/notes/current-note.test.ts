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

function noteNode(id: string, rank: number, parentId: string | null = null) {
  return {
    id,
    kind: "note",
    parentId,
    rank,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
  };
}

function folderNode(id: string, rank: number, parentId: string | null = null) {
  return { ...noteNode(id, rank, parentId), kind: "folder" };
}

async function storeWith(snapshot: Record<string, unknown>) {
  const { createInitialState, createRendererStore } =
    await import("@skriuw/renderer-core/store/store");
  return createRendererStore(
    createInitialState({
      protocolVersion: 1,
      documents: [],
      historyHeaders: [],
      settings: NOTE_SETTINGS,
      ...snapshot,
    } as never),
  );
}

test("trashCurrentNote soft-deletes the open note and opens the next one", async () => {
  const { trashCurrentNote } = await import("@/features/notes/current-note");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), noteNode("b", 2)],
  });

  assert.deepEqual(await trashCurrentNote(store), { noteId: "a", title: "a" });
  const state = store.getState();
  assert.equal(state.nodes.has("a"), false);
  assert.equal(state.sourceNodes.get("a")?.deletedAt !== null, true);
  assert.equal(state.activeNoteId, "b");
});

test("trashCurrentNote leaves the empty state when it was the last note", async () => {
  const { trashCurrentNote } = await import("@/features/notes/current-note");
  const store = await storeWith({ activeNoteId: "a", nodes: [noteNode("a", 1)] });

  assert.equal((await trashCurrentNote(store))?.noteId, "a");
  assert.equal(store.getState().activeNoteId, null);
});

test("trashCurrentNote is a silent no-op without an open note", async () => {
  const { trashCurrentNote } = await import("@/features/notes/current-note");
  const store = await storeWith({ activeNoteId: null, nodes: [folderNode("f", 1)] });
  assert.equal(await trashCurrentNote(store), null);
  assert.equal(store.getState().nodes.has("f"), true);
});

test("restoreTrashedNote brings the note back and reopens it", async () => {
  const { restoreTrashedNote, trashCurrentNote } = await import("@/features/notes/current-note");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), noteNode("b", 2)],
  });
  await trashCurrentNote(store);

  restoreTrashedNote(store, "a");
  const state = store.getState();
  assert.equal(state.nodes.has("a"), true);
  assert.equal(state.sourceNodes.get("a")?.deletedAt, null);
  assert.equal(state.activeNoteId, "a");
});

test("duplicateCurrentNote copies the open note after it and opens the copy", async () => {
  const { duplicateCurrentNote } = await import("@/features/notes/current-note");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [folderNode("f", 1), noteNode("a", 1, "f"), noteNode("b", 2, "f")],
    documents: [
      {
        noteId: "a",
        documentJson: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "a" }] },
          ],
        },
        markdown: "# a\n",
        revision: 1,
        wordCount: 1,
      },
    ],
  });

  const duplicated = await duplicateCurrentNote(store);
  assert.ok(duplicated);
  assert.equal(duplicated.title, "a (copy)");

  const state = store.getState();
  assert.equal(state.activeNoteId, duplicated.noteId);
  assert.equal(state.nodes.get(duplicated.noteId)?.parentId, "f");
  assert.equal(state.nodes.get(duplicated.noteId)?.title, "a (copy)");
  assert.notEqual(duplicated.noteId, "a");
  assert.equal(state.sourceNodes.get(duplicated.noteId)?.pinnedAt, null);
  assert.equal(state.nodes.has("a"), true);
  const order = state.nodeOrder.filter(
    (id) => id === "a" || id === duplicated.noteId || id === "b",
  );
  assert.deepEqual(order, ["a", duplicated.noteId, "b"]);
});

test("duplicateCurrentNote leaves the original pinned state and dates alone", async () => {
  const { duplicateCurrentNote } = await import("@/features/notes/current-note");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [{ ...noteNode("a", 1), pinnedAt: 42, createdAt: 42 }],
    documents: [
      {
        noteId: "a",
        documentJson: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "a" }] },
          ],
        },
        markdown: "# a\n",
        revision: 1,
        wordCount: 1,
      },
    ],
  });

  const duplicated = await duplicateCurrentNote(store);
  assert.ok(duplicated);
  const copy = store.getState().sourceNodes.get(duplicated.noteId);
  assert.equal(copy?.pinnedAt, null);
  assert.ok((copy?.createdAt ?? 0) > 42);
  assert.equal(store.getState().sourceNodes.get("a")?.pinnedAt, 42);
});

test("duplicateCurrentNote copies the note it is handed, not the open one", async () => {
  const { duplicateCurrentNote } = await import("@/features/notes/current-note");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [folderNode("f", 1), noteNode("a", 1, "f"), noteNode("b", 2, "f")],
    documents: [
      {
        noteId: "b",
        documentJson: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "b" }] },
          ],
        },
        markdown: "# b\n",
        revision: 1,
        wordCount: 1,
      },
    ],
  });

  const duplicated = await duplicateCurrentNote(store, "b");
  assert.ok(duplicated);
  const state = store.getState();
  assert.equal(state.nodes.get(duplicated.noteId)?.title, "b (copy)");
  const order = state.nodeOrder.filter(
    (id) => id === "a" || id === "b" || id === duplicated.noteId,
  );
  assert.deepEqual(order, ["a", "b", duplicated.noteId]);
});

test("duplicateCurrentNote ignores a target that is not a note", async () => {
  const { duplicateCurrentNote } = await import("@/features/notes/current-note");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [folderNode("f", 1), noteNode("a", 1, "f")],
  });
  assert.equal(await duplicateCurrentNote(store, "f"), null);
  assert.equal(store.getState().nodes.size, 2);
});

test("duplicateCurrentNote is a silent no-op without an open note", async () => {
  const { duplicateCurrentNote } = await import("@/features/notes/current-note");
  const store = await storeWith({ activeNoteId: null, nodes: [folderNode("f", 1)] });
  assert.equal(await duplicateCurrentNote(store), null);
  assert.equal(store.getState().nodes.size, 1);
});

test("duplicateCurrentNote opens the copy in the focused split pane", async () => {
  const { duplicateCurrentNote } = await import("@/features/notes/current-note");
  const { focusPane, openBeside } = await import("@/features/workspace-layout/panes");
  const { SECONDARY_PANE_ID, secondaryPane } = await import("@skriuw/renderer-core/store/panes");
  function document(noteId: string, text: string) {
    return {
      noteId,
      documentJson: {
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text }] }],
      },
      markdown: `# ${text}\n`,
      revision: 1,
      wordCount: 1,
    };
  }
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), noteNode("b", 2)],
    documents: [document("a", "a"), document("b", "b")],
  });
  openBeside(store, "b");
  focusPane(store, SECONDARY_PANE_ID);

  const duplicated = await duplicateCurrentNote(store);
  assert.ok(duplicated);
  assert.equal(duplicated.title, "b (copy)");
  const state = store.getState();
  assert.equal(secondaryPane(state.panes)?.activeNoteId, duplicated.noteId);
  assert.equal(state.activeNoteId, "a");
});
