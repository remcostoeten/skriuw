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

test("restoreNoteVersion flushes pending saves before reading the current revision", async () => {
  const { registerPendingWork } = await import("@/store/pending-work");
  const { restoreNoteVersion } = await import("@/features/history/restore-version");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1)],
    documents: [
      {
        noteId: "a",
        documentJson: { type: "doc", content: [{ type: "paragraph" }] },
        markdown: "Current\n",
        revision: 1,
        wordCount: 1,
      },
    ],
  });
  const sequence: string[] = [];
  const unregister = registerPendingWork(async () => {
    sequence.push("flush");
    store.applyAck({
      applied: 1,
      revisions: [{ id: "a", revision: 2 }],
      rankChanges: [],
    });
  });
  const globals = globalThis as typeof globalThis & {
    window: {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
        transformCallback: (callback: unknown) => unknown;
      };
    };
  };
  globals.window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    if (command === "apply_workspace_operations") {
      sequence.push("restore");
      const envelopes = args.operations as Array<{
        operation: { type: string; expectedRevision?: number };
      }>;
      assert.equal(envelopes[0]?.operation.type, "save_document");
      assert.equal(envelopes[0]?.operation.expectedRevision, 2);
      return {
        applied: 1,
        revisions: [{ id: "a", revision: 3 }],
        rankChanges: [],
      };
    }
    throw new Error(`unexpected command: ${command}`);
  };

  try {
    await restoreNoteVersion(store, "a", "Restored\n");
  } finally {
    unregister();
    setupTauriInvokeStub();
  }

  assert.deepEqual(sequence, ["flush", "restore"]);
  assert.equal(store.getState().documents.get("a")?.markdown, "Restored\n");
  assert.equal(store.getState().documents.get("a")?.revision, 3);
});

test("restoreNoteVersion retries once at the fresh revision after a conflict", async () => {
  const { restoreNoteVersion } = await import("@/features/history/restore-version");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1)],
    documents: [
      {
        noteId: "a",
        documentJson: { type: "doc", content: [{ type: "paragraph" }] },
        markdown: "Current\n",
        revision: 1,
        wordCount: 1,
      },
    ],
  });
  const expectedRevisions: number[] = [];
  const globals = globalThis as typeof globalThis & {
    window: {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
        transformCallback: (callback: unknown) => unknown;
      };
    };
  };
  globals.window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    if (command === "apply_workspace_operations") {
      const envelopes = args.operations as Array<{
        operation: { expectedRevision?: number };
      }>;
      const expected = envelopes[0]?.operation.expectedRevision ?? -1;
      expectedRevisions.push(expected);
      if (expected === 1) {
        throw "revision conflict for a: expected 1, current 2";
      }
      return { applied: 1, revisions: [{ id: "a", revision: 3 }], rankChanges: [] };
    }
    if (command === "bootstrap_workspace") {
      return {
        protocolVersion: 1,
        activeNoteId: "a",
        nodes: [noteNode("a", 1)],
        documents: [
          {
            noteId: "a",
            documentJson: { type: "doc", content: [{ type: "paragraph" }] },
            markdown: "Concurrent\n",
            revision: 2,
            wordCount: 1,
          },
        ],
        historyHeaders: [],
        settings: NOTE_SETTINGS,
      };
    }
    throw new Error(`unexpected command: ${command}`);
  };

  try {
    await restoreNoteVersion(store, "a", "Restored\n");
  } finally {
    setupTauriInvokeStub();
  }

  assert.deepEqual(expectedRevisions, [1, 2]);
  assert.equal(store.getState().documents.get("a")?.markdown, "Restored\n");
  assert.equal(store.getState().documents.get("a")?.revision, 3);
});

test("restoreNoteVersion surfaces a conflict when no fresh revision appears", async () => {
  const { restoreNoteVersion } = await import("@/features/history/restore-version");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1)],
    documents: [
      {
        noteId: "a",
        documentJson: { type: "doc", content: [{ type: "paragraph" }] },
        markdown: "Current\n",
        revision: 1,
        wordCount: 1,
      },
    ],
  });
  let applies = 0;
  const globals = globalThis as typeof globalThis & {
    window: {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
        transformCallback: (callback: unknown) => unknown;
      };
    };
  };
  globals.window.__TAURI_INTERNALS__.invoke = async (command) => {
    if (command === "apply_workspace_operations") {
      applies += 1;
      throw "revision conflict for a: expected 1, current 1";
    }
    if (command === "bootstrap_workspace") {
      return {
        protocolVersion: 1,
        activeNoteId: "a",
        nodes: [noteNode("a", 1)],
        documents: [
          {
            noteId: "a",
            documentJson: { type: "doc", content: [{ type: "paragraph" }] },
            markdown: "Current\n",
            revision: 1,
            wordCount: 1,
          },
        ],
        historyHeaders: [],
        settings: NOTE_SETTINGS,
      };
    }
    throw new Error(`unexpected command: ${command}`);
  };

  let rejection: unknown = null;
  try {
    await restoreNoteVersion(store, "a", "Restored\n");
  } catch (error) {
    rejection = error;
  } finally {
    setupTauriInvokeStub();
  }
  assert.match(String(rejection), /revision conflict/);
  assert.equal(applies, 1);
});
