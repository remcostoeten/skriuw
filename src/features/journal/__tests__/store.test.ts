import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type JournalEntryRecord = {
  id: string;
  dateKey: string;
  content: string;
  tags: string[];
  mood?: number;
  createdAt: Date;
  updatedAt: Date;
};

type JournalTagRecord = {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

let authWorkspaceId = "guest-local";
let listEntriesDeferred: Deferred<JournalEntryRecord[]>;
let listTagsDeferred: Deferred<JournalTagRecord[]>;
let createEntryDeferred: Deferred<void>;

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
    journalRepository: {
      listEntries: () => listEntriesDeferred.promise,
      listTags: () => listTagsDeferred.promise,
      createEntry: () => createEntryDeferred.promise,
      updateEntry: async () => undefined,
      destroyEntry: async () => undefined,
      createTag: async () => undefined,
      destroyTag: async () => undefined,
    },
  }));

  return import(`../store?test=${Math.random().toString(36).slice(2)}`);
}

beforeEach(() => {
  authWorkspaceId = "guest-local";
  listEntriesDeferred = createDeferredPromise<JournalEntryRecord[]>();
  listTagsDeferred = createDeferredPromise<JournalTagRecord[]>();
  createEntryDeferred = createDeferredPromise<void>();
});

afterEach(() => {
  mock.restore();
});

describe("journal store workspace guards", () => {
  test("ignores stale hydration results after the workspace changes", async () => {
    authWorkspaceId = "user-a";
    const { useJournalStore } = await loadStoreModule();

    const initializePromise = useJournalStore.getState().initialize("user-a");

    authWorkspaceId = "user-b";
    useJournalStore.getState().resetWorkspace();

    listEntriesDeferred.resolve([
      {
        id: "entry-a",
        dateKey: "2026-04-15",
        content: "alpha",
        tags: ["focus"],
        mood: 4,
        createdAt: new Date("2026-04-15T10:00:00.000Z"),
        updatedAt: new Date("2026-04-15T10:00:00.000Z"),
      },
    ]);
    listTagsDeferred.resolve([
      {
        id: "tag-a",
        name: "focus",
        color: "#22c55e",
        createdAt: new Date("2026-04-15T10:00:00.000Z"),
        updatedAt: new Date("2026-04-15T10:00:00.000Z"),
      },
    ]);

    await initializePromise;
    await flushMicrotasks();

    expect(useJournalStore.getState().config.entries).toHaveLength(0);
    expect(useJournalStore.getState().config.tags).toHaveLength(0);
    expect(useJournalStore.getState().isHydrated).toBe(false);
  });

  test("does not restore save state from a stale create completion after reset", async () => {
    authWorkspaceId = "user-a";
    const { useJournalStore } = await loadStoreModule();

    const newEntry = useJournalStore
      .getState()
      .createOrUpdateEntry(new Date("2026-04-15T00:00:00.000Z"), "hello", ["Focus"], 4);

    expect(useJournalStore.getState().saveStates[newEntry.id]).toBe("saving");

    authWorkspaceId = "user-b";
    useJournalStore.getState().resetWorkspace();

    createEntryDeferred.resolve();
    await flushMicrotasks();

    expect(useJournalStore.getState().config.entries).toHaveLength(0);
    expect(useJournalStore.getState().saveStates).toEqual({});
    expect(useJournalStore.getState().isHydrated).toBe(false);
  });
});
