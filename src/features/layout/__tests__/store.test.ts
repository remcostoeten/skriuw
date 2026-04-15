import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let authWorkspaceId = "guest-local";

class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  clear() {
    this.#entries.clear();
  }

  getItem(key: string) {
    return this.#entries.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.#entries.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.#entries.delete(key);
  }

  setItem(key: string, value: string) {
    this.#entries.set(key, value);
  }

  get length() {
    return this.#entries.size;
  }
}

let storage: MemoryStorage;
const originalLocalStorage = globalThis.localStorage;
const originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function buildAuthSnapshot() {
  return {
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
  };
}

async function loadStoreModule() {
  mock.module("@/platform/auth", () => ({
    getWorkspaceId: () => authWorkspaceId,
    getAuthStateSnapshot: () => buildAuthSnapshot(),
    subscribeAuthState: () => () => undefined,
  }));

  return import(`../store?test=${Math.random().toString(36).slice(2)}`);
}

function readPersistedSidebarWidth(workspaceId: string) {
  const raw = storage.getItem(`document-store:${workspaceId}`);
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as {
    state?: {
      ui?: {
        sidebarWidth?: number;
      };
    };
  };

  return parsed.state?.ui?.sidebarWidth ?? null;
}

beforeEach(() => {
  authWorkspaceId = "guest-local";
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
});

afterEach(() => {
  mock.restore();
  storage.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("layout store workspace scoping", () => {
  test("keeps sidebar width isolated per workspace across reloads", async () => {
    authWorkspaceId = "user-a";
    const { useDocumentStore } = await loadStoreModule();

    await flushMicrotasks();

    useDocumentStore.getState().setSidebarWidth(360);
    await flushMicrotasks();

    expect(readPersistedSidebarWidth("user-a")).toBe(360);

    authWorkspaceId = "user-b";
    const { useDocumentStore: userBStore } = await loadStoreModule();
    await flushMicrotasks();

    expect(userBStore.getState().ui.sidebarWidth).toBe(296);

    userBStore.getState().setSidebarWidth(312);
    await flushMicrotasks();

    expect(readPersistedSidebarWidth("user-b")).toBe(312);

    authWorkspaceId = "user-a";
    const { useDocumentStore: reloadedUserAStore } = await loadStoreModule();
    await flushMicrotasks();

    expect(reloadedUserAStore.getState().ui.sidebarWidth).toBe(360);

    authWorkspaceId = "user-b";
    const { useDocumentStore: reloadedUserBStore } = await loadStoreModule();
    await flushMicrotasks();

    expect(reloadedUserBStore.getState().ui.sidebarWidth).toBe(312);
  });
});
