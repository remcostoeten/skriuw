import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import { setupTauriInvokeStub } from "../../../shared/tauri-stub";

setupTauriInvokeStub();

type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;
type TauriWindow = {
  location: { hash: string };
  __TAURI_INTERNALS__: { invoke: Invoke; transformCallback: (callback: unknown) => unknown };
};

const SETTINGS = {
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

const files = new Map<string, string>();

function serveFiles(): void {
  const globals = globalThis as typeof globalThis & { window: TauriWindow };
  globals.window.location = { hash: "" };
  globals.window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    if (command === "prepare_import_sources") {
      const [path] = args.sourcePaths as string[];
      const content = files.get(path ?? "");
      if (content === undefined) throw new Error(`missing ${path}`);
      return {
        rootPath: "/tmp/opened",
        assetRoot: "/tmp/opened",
        temporary: false,
        tree: {
          directories: [],
          files: [
            {
              relativePath: path?.split("/").pop(),
              content,
              createdAt: 1_000,
              modifiedAt: 2_000,
            },
          ],
          assets: [],
          unsupported: [],
          skipped: 0,
        },
      };
    }
    if (command === "apply_workspace_operations") {
      const envelopes = args.operations as { operation: WorkspaceOperation }[];
      return {
        applied: envelopes.length,
        revisions: envelopes.flatMap(({ operation }) =>
          operation.type === "save_document"
            ? [{ id: operation.noteId, revision: operation.expectedRevision + 1 }]
            : [],
        ),
        rankChanges: [],
      };
    }
    throw new Error(`unexpected command: ${command}`);
  };
}

async function emptyStore() {
  const { createInitialState, createRendererStore } =
    await import("@skriuw/renderer-core/store/store");
  return createRendererStore(
    createInitialState({
      protocolVersion: 1,
      activeNoteId: null,
      nodes: [],
      documents: [],
      historyHeaders: [],
      settings: SETTINGS,
    } as never),
  );
}

afterEach(() => {
  files.clear();
  setupTauriInvokeStub();
});

test("opens a file once, follows its changes and recognises it after a move", async () => {
  serveFiles();
  const { openFileInWorkspace } = await import("@/features/transfer/import/actions");
  const store = await emptyStore();
  files.set("/home/me/todo.md", "# Todo\n\nFirst");

  const noteId = await openFileInWorkspace(store, "/home/me/todo.md");
  assert.ok(noteId);
  assert.equal(store.getState().nodes.get(noteId)?.title, "Todo");
  assert.equal(store.getState().documents.get(noteId)?.markdown.trim(), "First");
  assert.equal(store.getState().sourceNodes.get(noteId)?.createdAt, 1_000);
  assert.equal(store.getState().metadata.get(noteId)?.updatedAt, 2_000);
  const [receipt] = store.getState().importReceipts;
  assert.equal(receipt?.sourcePath, "/home/me/todo.md");
  assert.equal(receipt?.openedFile?.formatId, "markdown");

  assert.equal(await openFileInWorkspace(store, "/home/me/todo.md"), noteId);
  assert.equal(store.getState().nodes.size, 1);

  files.set("/home/me/todo.md", "# Todo\n\nSecond");
  assert.equal(await openFileInWorkspace(store, "/home/me/todo.md"), noteId);
  assert.equal(store.getState().documents.get(noteId)?.markdown.trim(), "Second");
  assert.equal(store.getState().nodes.size, 1);

  files.set("/home/me/archive/todo.md", "# Todo\n\nSecond");
  assert.equal(await openFileInWorkspace(store, "/home/me/archive/todo.md"), noteId);
  const { openedFileOrigin } = await import("@/features/transfer/opened-file-origin");
  assert.equal(
    openedFileOrigin(store.getState().importReceipts, noteId),
    "/home/me/archive/todo.md",
  );
});

test("keeps note edits when only the note changed and asks when both changed", async () => {
  serveFiles();
  const { openFileInWorkspace } = await import("@/features/transfer/import/actions");
  const { commitOperations } = await import("@/store/commit");
  const { registerOpenedFileConflictListener } =
    await import("@/features/transfer/dialogs/opened-file-conflict-controller");
  const store = await emptyStore();
  files.set("/home/me/plan.md", "Draft");
  const noteId = await openFileInWorkspace(store, "/home/me/plan.md");
  assert.ok(noteId);

  const document = store.getState().documents.get(noteId);
  assert.ok(document);
  await commitOperations(store, [
    {
      type: "save_document",
      noteId,
      documentJson: document.documentJson,
      markdown: "Edited in Skriuw\n",
      wordCount: 3,
      expectedRevision: document.revision,
      at: 3,
    },
  ]);
  assert.equal(await openFileInWorkspace(store, "/home/me/plan.md"), noteId);
  assert.equal(store.getState().documents.get(noteId)?.markdown, "Edited in Skriuw\n");

  files.set("/home/me/plan.md", "Edited on disk");
  const asked = new Promise<(choice: "both") => void>((resolve) => {
    registerOpenedFileConflictListener((request) => {
      assert.equal(request.filePath, "/home/me/plan.md");
      resolve(request.resolve);
    });
  });
  assert.equal(await openFileInWorkspace(store, "/home/me/plan.md"), noteId);
  assert.equal(store.getState().documents.get(noteId)?.markdown, "Edited in Skriuw\n");
  (await asked)("both");
  await new Promise((resolve) => setTimeout(resolve, 20));

  const notes = [...store.getState().nodes.values()].filter((node) => node.kind === "note");
  assert.equal(notes.length, 2);
  const copy = notes.find((node) => node.id !== noteId);
  assert.ok(copy);
  assert.equal(store.getState().documents.get(copy.id)?.markdown.trim(), "Edited on disk");
  assert.equal(store.getState().activeNoteId, copy.id);
  assert.equal(store.getState().documents.get(noteId)?.markdown, "Edited in Skriuw\n");
});
