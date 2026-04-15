import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type RepositoryFile = {
  id: string;
  name: string;
  content: string;
  richContent: { type: string; markdown: string };
  preferredEditorMode: "block" | "raw";
  createdAt: Date;
  updatedAt: Date;
  parentId: string | null;
};

type RepositoryFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let authWorkspaceId = "guest-local";
let incrementNoteCountCalls = 0;
let listDeferred: Deferred<RepositoryFile[]>;
let foldersDeferred: Deferred<RepositoryFolder[]>;
let createDeferred: Deferred<RepositoryFile>;

function createDeferredPromise<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function loadStoreModule() {
  mock.module("@/platform/auth", () => ({
    getWorkspaceId: () => authWorkspaceId,
    getAuthStateSnapshot: () => ({
      phase: authWorkspaceId === "guest-local" ? "guest" : "authenticated",
      workspaceMode: authWorkspaceId === "guest-local" ? "guest" : "cloud",
      rememberMe: true,
      isReady: true,
      isSupabaseConfigured: false,
      user:
        authWorkspaceId === "guest-local"
          ? null
          : {
              id: authWorkspaceId,
              email: `${authWorkspaceId}@example.com`,
              name: authWorkspaceId,
            },
      session: null,
      error: null,
      workspaceId: authWorkspaceId,
    }),
    subscribeAuthState: () => () => undefined,
  }));

  mock.module("@/core/persistence/repositories", () => ({
    notesRepository: {
      list: () => listDeferred.promise,
      create: () => createDeferred.promise,
      update: async () => undefined,
      destroy: async () => undefined,
      rename: async () => undefined,
      move: async () => undefined,
    },
    foldersRepository: {
      list: () => foldersDeferred.promise,
      create: async () => undefined,
      update: async () => undefined,
      destroy: async () => undefined,
      rename: async () => undefined,
      move: async () => undefined,
    },
  }));

  mock.module("@/features/settings/store", () => ({
    usePreferencesStore: {
      getState: () => ({
        editor: {
          defaultModeRaw: false,
        },
        incrementNoteCount: () => {
          incrementNoteCountCalls += 1;
        },
      }),
    },
  }));

  mock.module("@/shared/lib/rich-document", () => ({
    markdownToRichDocument: (markdown: string) => ({
      type: "doc",
      markdown,
    }),
  }));

  return import(`../store?test=${Math.random().toString(36).slice(2)}`);
}

beforeEach(() => {
  authWorkspaceId = "guest-local";
  incrementNoteCountCalls = 0;
  listDeferred = createDeferredPromise<RepositoryFile[]>();
  foldersDeferred = createDeferredPromise<RepositoryFolder[]>();
  createDeferred = createDeferredPromise<RepositoryFile>();
});

afterEach(() => {
  mock.restore();
});

describe("notes store workspace guards", () => {
  test("ignores stale hydration results after the workspace changes", async () => {
    authWorkspaceId = "user-a";
    const { useNotesStore } = await loadStoreModule();

    const initializePromise = useNotesStore.getState().initialize("user-a");

    authWorkspaceId = "user-b";
    useNotesStore.getState().resetWorkspace();

    listDeferred.resolve([
      {
        id: "note-a",
        name: "Alpha.md",
        content: "# Alpha",
        richContent: { type: "doc", markdown: "# Alpha" },
        preferredEditorMode: "block",
        createdAt: new Date("2026-04-15T10:00:00.000Z"),
        updatedAt: new Date("2026-04-15T10:00:00.000Z"),
        parentId: null,
      },
    ]);
    foldersDeferred.resolve([
      {
        id: "folder-a",
        name: "Folder A",
        parentId: null,
        createdAt: new Date("2026-04-15T10:00:00.000Z"),
        updatedAt: new Date("2026-04-15T10:00:00.000Z"),
      },
    ]);

    await initializePromise;
    await flushMicrotasks();

    expect(useNotesStore.getState().files).toHaveLength(0);
    expect(useNotesStore.getState().folders).toHaveLength(0);
    expect(useNotesStore.getState().activeFileId).toBe("");
    expect(useNotesStore.getState().isHydrated).toBe(false);
  });

  test("does not restore save state from a stale create completion after reset", async () => {
    authWorkspaceId = "user-a";
    const { useNotesStore } = await loadStoreModule();

    const createdFile = useNotesStore.getState().createFile("Draft");

    expect(useNotesStore.getState().saveStates[createdFile.id]).toBe("saving");
    expect(incrementNoteCountCalls).toBe(1);

    authWorkspaceId = "user-b";
    useNotesStore.getState().resetWorkspace();

    createDeferred.resolve({
      id: createdFile.id,
      name: createdFile.name,
      content: createdFile.content,
      richContent: { type: "doc", markdown: createdFile.content },
      preferredEditorMode: createdFile.preferredEditorMode,
      createdAt: createdFile.createdAt,
      updatedAt: createdFile.modifiedAt,
      parentId: createdFile.parentId,
    });

    await flushMicrotasks();

    expect(useNotesStore.getState().files).toHaveLength(0);
    expect(useNotesStore.getState().saveStates).toEqual({});
    expect(useNotesStore.getState().activeFileId).toBe("");
    expect(useNotesStore.getState().isHydrated).toBe(false);
  });
});
