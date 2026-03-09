import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

function createRequest<T>(result: T) {
  const request: {
    result: T;
    error: null;
    onsuccess: null | (() => void);
    onerror: null | (() => void);
  } = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  };

  queueMicrotask(() => {
    request.onsuccess?.();
  });

  return request;
}

describe("destroyFolder", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  test("destroys descendant folders and notes within the subtree", async () => {
    const deletedFolders: string[] = [];
    const deletedNotes: string[] = [];

    const folderStore = {
      getAll: () =>
        createRequest([
          { id: "folder-1", parentId: null },
          { id: "folder-2", parentId: "folder-1" },
          { id: "folder-3", parentId: "folder-2" },
          { id: "folder-4", parentId: null },
        ]),
      delete: (id: string) => {
        deletedFolders.push(id);
        return createRequest(undefined);
      },
    };

    const noteStore = {
      getAll: () =>
        createRequest([
          { id: "note-1", parentId: "folder-1" },
          { id: "note-2", parentId: "folder-2" },
          { id: "note-3", parentId: "folder-4" },
        ]),
      delete: (id: string) => {
        deletedNotes.push(id);
        return createRequest(undefined);
      },
    };

    mock.module("@/core/storage", () => ({
      runInTransaction: async (
        _storeNames: string[],
        _mode: string,
        run: (stores: Map<string, unknown>) => Promise<void>,
      ) =>
        run(
          new Map([
            ["folders", folderStore],
            ["notes", noteStore],
          ]),
        ),
      toStorageError: (_code: string, message: string) => new Error(message),
    }));

    const { destroyFolder } = await import("../destroy-folder");
    await destroyFolder("folder-1" as never);

    expect(deletedFolders.sort()).toEqual(["folder-1", "folder-2", "folder-3"]);
    expect(deletedNotes.sort()).toEqual(["note-1", "note-2"]);
  });
});
