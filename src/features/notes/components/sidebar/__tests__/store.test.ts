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

function readPersistedSidebarState() {
  const raw = storage.getItem("theme-sidebar");
  return raw ? JSON.parse(raw) : null;
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

describe("sidebar store actor scoping", () => {
  test("keeps favorites, recents, custom sections, projects, and visibility prefs isolated per actor", async () => {
    authActorId = "user-a";
    const { useSidebarStore } = await loadStoreModule();

    await flushMicrotasks();

    useSidebarStore.getState().toggleSectionVisibility("search");
    useSidebarStore.getState().toggleCompactMode();
    useSidebarStore.getState().addCustomSection("A Custom");
    useSidebarStore.getState().addToFavorites("file-a", "file");
    useSidebarStore.getState().addToRecents("file-a", "file");
    const actorASection = useSidebarStore
      .getState()
      .config.sections.find((section) => section.type === "custom");
    if (!actorASection) {
      throw new Error("Expected actor A custom section.");
    }
    const actorAProject = useSidebarStore.getState().createProject("Actor A Project", "bg-blue-500");
    useSidebarStore.getState().addToProject(actorAProject.id, "file-a", "file");
    useSidebarStore.getState().addToCustomSection(actorASection.id, "file-a", "file");
    await flushMicrotasks();

    authActorId = "user-b";
    await useSidebarStore.getState().syncActor("user-b");
    await flushMicrotasks();

    expect(useSidebarStore.getState().config.favorites).toHaveLength(0);
    expect(useSidebarStore.getState().config.recents).toHaveLength(0);
    expect(useSidebarStore.getState().config.projects).toHaveLength(0);
    expect(useSidebarStore.getState().config.compactMode).toBe(false);
    expect(
      useSidebarStore.getState().config.sections.find((section) => section.id === "search")?.isVisible,
    ).toBe(true);
    expect(useSidebarStore.getState().config.sections.some((section) => section.type === "custom")).toBe(
      false,
    );

    useSidebarStore.getState().toggleSectionVisibility("favorites");
    useSidebarStore.getState().toggleShowSectionHeaders();
    useSidebarStore.getState().addCustomSection("B Custom");
    useSidebarStore.getState().addToFavorites("file-b", "file");
    useSidebarStore.getState().addToRecents("file-b", "file");
    const actorBSection = useSidebarStore
      .getState()
      .config.sections.find((section) => section.type === "custom");
    if (!actorBSection) {
      throw new Error("Expected actor B custom section.");
    }
    const actorBProject = useSidebarStore.getState().createProject("Actor B Project", "bg-emerald-500");
    useSidebarStore.getState().addToProject(actorBProject.id, "file-b", "file");
    useSidebarStore.getState().addToCustomSection(actorBSection.id, "file-b", "file");
    await flushMicrotasks();

    const persistedState = readPersistedSidebarState();
    expect(persistedState).not.toBeNull();
    expect(Object.keys(persistedState.state.profiles)).toEqual(
      expect.arrayContaining(["user-a", "user-b"]),
    );
    expect(
      persistedState.state.profiles["user-a"].favorites.map((item: { itemId: string }) => item.itemId),
    ).toEqual(["file-a"]);
    expect(
      persistedState.state.profiles["user-b"].favorites.map((item: { itemId: string }) => item.itemId),
    ).toEqual(["file-b"]);

    authActorId = "user-a";
    await useSidebarStore.getState().syncActor("user-a");
    await flushMicrotasks();

    expect(useSidebarStore.getState().config.favorites.map((item) => item.itemId)).toEqual(["file-a"]);
    expect(useSidebarStore.getState().config.recents.map((item) => item.itemId)).toEqual(["file-a"]);
    expect(useSidebarStore.getState().config.projects.map((project) => project.name)).toEqual([
      "Actor A Project",
    ]);
    expect(
      useSidebarStore.getState().config.sections.find((section) => section.type === "custom")?.name,
    ).toBe("A Custom");
    expect(
      useSidebarStore.getState().config.sections.find((section) => section.id === "search")?.isVisible,
    ).toBe(false);
    expect(useSidebarStore.getState().config.compactMode).toBe(true);

    authActorId = "user-b";
    await useSidebarStore.getState().syncActor("user-b");
    await flushMicrotasks();

    expect(useSidebarStore.getState().config.favorites.map((item) => item.itemId)).toEqual(["file-b"]);
    expect(useSidebarStore.getState().config.recents.map((item) => item.itemId)).toEqual(["file-b"]);
    expect(useSidebarStore.getState().config.projects.map((project) => project.name)).toEqual([
      "Actor B Project",
    ]);
    expect(
      useSidebarStore.getState().config.sections.find((section) => section.type === "custom")?.name,
    ).toBe("B Custom");
    expect(
      useSidebarStore.getState().config.sections.find((section) => section.id === "favorites")?.isVisible,
    ).toBe(false);
    expect(useSidebarStore.getState().config.showSectionHeaders).toBe(false);
  });
});
