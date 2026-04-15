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

function readPersistedSidebarState() {
  const raw = storage.getItem("skriuw-sidebar");
  return raw ? JSON.parse(raw) : null;
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

describe("sidebar store workspace scoping", () => {
  test("keeps favorites, recents, custom sections, projects, and visibility prefs isolated per workspace", async () => {
    authWorkspaceId = "user-a";
    const { useSidebarStore } = await loadStoreModule();

    await flushMicrotasks();

    useSidebarStore.getState().toggleSectionVisibility("search");
    useSidebarStore.getState().toggleCompactMode();
    useSidebarStore.getState().addCustomSection("A Custom");
    useSidebarStore.getState().addToFavorites("file-a", "file");
    useSidebarStore.getState().addToRecents("file-a", "file");
    const workspaceASection = useSidebarStore
      .getState()
      .config.sections.find((section) => section.type === "custom");
    if (!workspaceASection) {
      throw new Error("Expected workspace A custom section.");
    }
    const workspaceAProject = useSidebarStore.getState().createProject("Workspace A Project", "bg-blue-500");
    useSidebarStore.getState().addToProject(workspaceAProject.id, "file-a", "file");
    useSidebarStore.getState().addToCustomSection(workspaceASection.id, "file-a", "file");
    await flushMicrotasks();

    authWorkspaceId = "user-b";
    await useSidebarStore.getState().syncWorkspace("user-b");
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
    const workspaceBSection = useSidebarStore
      .getState()
      .config.sections.find((section) => section.type === "custom");
    if (!workspaceBSection) {
      throw new Error("Expected workspace B custom section.");
    }
    const workspaceBProject = useSidebarStore.getState().createProject("Workspace B Project", "bg-emerald-500");
    useSidebarStore.getState().addToProject(workspaceBProject.id, "file-b", "file");
    useSidebarStore.getState().addToCustomSection(workspaceBSection.id, "file-b", "file");
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

    authWorkspaceId = "user-a";
    await useSidebarStore.getState().syncWorkspace("user-a");
    await flushMicrotasks();

    expect(useSidebarStore.getState().config.favorites.map((item) => item.itemId)).toEqual(["file-a"]);
    expect(useSidebarStore.getState().config.recents.map((item) => item.itemId)).toEqual(["file-a"]);
    expect(useSidebarStore.getState().config.projects.map((project) => project.name)).toEqual([
      "Workspace A Project",
    ]);
    expect(
      useSidebarStore.getState().config.sections.find((section) => section.type === "custom")?.name,
    ).toBe("A Custom");
    expect(
      useSidebarStore.getState().config.sections.find((section) => section.id === "search")?.isVisible,
    ).toBe(false);
    expect(useSidebarStore.getState().config.compactMode).toBe(true);

    authWorkspaceId = "user-b";
    await useSidebarStore.getState().syncWorkspace("user-b");
    await flushMicrotasks();

    expect(useSidebarStore.getState().config.favorites.map((item) => item.itemId)).toEqual(["file-b"]);
    expect(useSidebarStore.getState().config.recents.map((item) => item.itemId)).toEqual(["file-b"]);
    expect(useSidebarStore.getState().config.projects.map((project) => project.name)).toEqual([
      "Workspace B Project",
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
