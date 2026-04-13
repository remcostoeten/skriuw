import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let authActorId = "privacy-local";

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
    mode: authActorId === "privacy-local" ? "privacy" : "account",
    status: authActorId === "privacy-local" ? "privacy" : "authenticated",
    rememberMe: true,
    isReady: true,
    isSupabaseConfigured: false,
    user:
      authActorId === "privacy-local"
        ? null
        : {
            id: authActorId,
            email: `${authActorId}@example.com`,
            name: authActorId,
          },
    session: null,
    error: null,
    actorId: authActorId,
    canSync: false,
  };
}

async function loadStoreModule() {
  mock.module("@/platform/auth", () => ({
    getAuthActorId: () => authActorId,
    getAuthStateSnapshot: () => buildAuthSnapshot(),
    subscribeAuthState: () => () => undefined,
  }));

  return import(`../store?test=${Math.random().toString(36).slice(2)}`);
}

function readPersistedSidebarWidth(actorId: string) {
  const raw = storage.getItem(`document-store:${actorId}`);
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
  authActorId = "privacy-local";
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

describe("layout store actor scoping", () => {
  test("keeps sidebar width isolated per actor across reloads", async () => {
    authActorId = "user-a";
    const { useDocumentStore } = await loadStoreModule();

    await flushMicrotasks();

    useDocumentStore.getState().setSidebarWidth(360);
    await flushMicrotasks();

    expect(readPersistedSidebarWidth("user-a")).toBe(360);

    authActorId = "user-b";
    const { useDocumentStore: userBStore } = await loadStoreModule();
    await flushMicrotasks();

    expect(userBStore.getState().ui.sidebarWidth).toBe(296);

    userBStore.getState().setSidebarWidth(312);
    await flushMicrotasks();

    expect(readPersistedSidebarWidth("user-b")).toBe(312);

    authActorId = "user-a";
    const { useDocumentStore: reloadedUserAStore } = await loadStoreModule();
    await flushMicrotasks();

    expect(reloadedUserAStore.getState().ui.sidebarWidth).toBe(360);

    authActorId = "user-b";
    const { useDocumentStore: reloadedUserBStore } = await loadStoreModule();
    await flushMicrotasks();

    expect(reloadedUserBStore.getState().ui.sidebarWidth).toBe(312);
  });
});
