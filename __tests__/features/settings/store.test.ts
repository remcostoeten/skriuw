import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let authWorkspaceId = "signed-out-local";

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

async function loadStoreModule() {
  mock.module("@/platform/auth", () => ({
    getWorkspaceId: () => authWorkspaceId,
    getAuthStateSnapshot: () => ({
      phase: authWorkspaceId === "signed-out-local" ? "signed_out" : "authenticated",
      rememberMe: true,
      isReady: true,
      isSupabaseConfigured: false,
      user:
        authWorkspaceId === "signed-out-local"
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

  return import(`@/features/settings/store?test=${Math.random().toString(36).slice(2)}`);
}

function readPersistedPreferences() {
  const raw = storage.getItem("preferences-store");
  return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : null;
}

beforeEach(() => {
  authWorkspaceId = "signed-out-local";
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

describe("preferences store workspace scoping", () => {
  test("keeps preferences, note counts, and activity isolated per workspace across reloads", async () => {
    authWorkspaceId = "user-a";
    const { usePreferencesStore } = await loadStoreModule();

    await flushMicrotasks();

    expect(usePreferencesStore.getState().workspaceId).toBeNull();
    expect(usePreferencesStore.getState().editor.defaultModeRaw).toBe(false);
    expect(usePreferencesStore.getState().amountOfNotes).toBe(0);
    expect(usePreferencesStore.getState().activity).toHaveLength(0);

    usePreferencesStore.getState().syncWorkspace("user-a");
    usePreferencesStore.getState().updateEditorPreference("defaultModeRaw", true);
    usePreferencesStore.getState().recordMood("calm");
    usePreferencesStore.getState().incrementNoteCount();
    usePreferencesStore.getState().logActivity("settings_opened");
    await flushMicrotasks();

    usePreferencesStore.getState().syncWorkspace("user-b");

    expect(usePreferencesStore.getState().editor.defaultModeRaw).toBe(false);
    expect(usePreferencesStore.getState().journal.diaryModeEnabled).toBe(false);
    expect(usePreferencesStore.getState().journal.recentMoods).toHaveLength(0);
    expect(usePreferencesStore.getState().amountOfNotes).toBe(0);
    expect(usePreferencesStore.getState().activity).toHaveLength(0);

    usePreferencesStore.getState().updateEditorPreference("defaultPlaceholder", "Actor B");
    usePreferencesStore.getState().toggleDiaryMode();
    await flushMicrotasks();

    const persistedState = readPersistedPreferences();
    expect(persistedState).not.toBeNull();
    expect(Object.keys((persistedState?.profiles as Record<string, unknown>) ?? {})).toEqual(
      expect.arrayContaining(["user-a", "user-b"]),
    );

    authWorkspaceId = "user-a";
    const { usePreferencesStore: reloadedStore } = await loadStoreModule();

    await flushMicrotasks();

    expect(reloadedStore.getState().workspaceId).toBeNull();
    expect(reloadedStore.getState().editor.defaultModeRaw).toBe(false);
    expect(reloadedStore.getState().journal.diaryModeEnabled).toBe(false);
    expect(reloadedStore.getState().amountOfNotes).toBe(0);
    expect(reloadedStore.getState().activity).toHaveLength(0);

    reloadedStore.getState().initialize();

    expect(reloadedStore.getState().workspaceId).toBe("user-a");
    expect(reloadedStore.getState().editor.defaultModeRaw).toBe(true);
    expect(reloadedStore.getState().editor.defaultPlaceholder).toBe("Start writing...");
    expect(
      reloadedStore
        .getState()
        .journal.recentMoods.map((item: { mood: string }) => item.mood),
    ).toEqual(["calm"]);
    expect(reloadedStore.getState().amountOfNotes).toBe(1);
    expect(
      reloadedStore
        .getState()
        .activity.map((item: { action: string }) => item.action),
    ).toEqual([
      "settings_opened",
      "note_created",
    ]);

    reloadedStore.getState().syncWorkspace("user-b");

    expect(reloadedStore.getState().workspaceId).toBe("user-b");
    expect(reloadedStore.getState().editor.defaultModeRaw).toBe(false);
    expect(reloadedStore.getState().editor.defaultPlaceholder).toBe("Actor B");
    expect(reloadedStore.getState().journal.diaryModeEnabled).toBe(true);
    expect(reloadedStore.getState().journal.recentMoods).toHaveLength(0);
    expect(reloadedStore.getState().amountOfNotes).toBe(0);
    expect(
      reloadedStore
        .getState()
        .activity.map((item: { action: string }) => item.action),
    ).toEqual(["diary_toggled"]);
  });

  test("migrates the legacy global preferences blob into the owning workspace profile only", async () => {
    const legacyTimestamp = "2026-04-13T10:00:00.000Z";

    storage.setItem(
      "preferences-store",
      JSON.stringify({
        state: {
          userId: "legacy-user",
          editor: {
            defaultModeRaw: true,
            defaultPlaceholder: "Legacy placeholder",
          },
          journal: {
            diaryModeEnabled: true,
            recentMoods: [{ mood: "focused", date: legacyTimestamp }],
          },
          amountOfNotes: 4,
          activity: [{ id: "legacy-1", action: "settings_opened", createdAt: legacyTimestamp }],
        },
      }),
    );

    authWorkspaceId = "legacy-user";
    const { usePreferencesStore } = await loadStoreModule();

    await flushMicrotasks();

    expect(usePreferencesStore.getState().workspaceId).toBeNull();
    usePreferencesStore.getState().initialize();

    expect(usePreferencesStore.getState().workspaceId).toBe("legacy-user");
    expect(usePreferencesStore.getState().editor.defaultModeRaw).toBe(true);
    expect(usePreferencesStore.getState().editor.defaultPlaceholder).toBe("Legacy placeholder");
    expect(usePreferencesStore.getState().journal.diaryModeEnabled).toBe(true);
    expect(
      usePreferencesStore
        .getState()
        .journal.recentMoods.map((item: { mood: string }) => item.mood),
    ).toEqual(["focused"]);
    expect(usePreferencesStore.getState().amountOfNotes).toBe(4);
    expect(
      usePreferencesStore
        .getState()
        .activity.map((item: { action: string }) => item.action),
    ).toEqual(["settings_opened"]);

    usePreferencesStore.getState().syncWorkspace("other-user");

    expect(usePreferencesStore.getState().workspaceId).toBe("other-user");
    expect(usePreferencesStore.getState().editor.defaultModeRaw).toBe(false);
    expect(usePreferencesStore.getState().editor.defaultPlaceholder).toBe("Start writing...");
    expect(usePreferencesStore.getState().journal.diaryModeEnabled).toBe(false);
    expect(usePreferencesStore.getState().journal.recentMoods).toHaveLength(0);
    expect(usePreferencesStore.getState().amountOfNotes).toBe(0);
    expect(usePreferencesStore.getState().activity).toHaveLength(0);

    const migratedState = readPersistedPreferences();
    expect(migratedState).toEqual(
      expect.objectContaining({
        profiles: expect.objectContaining({
          "legacy-user": expect.objectContaining({
            amountOfNotes: 4,
          }),
          "other-user": expect.objectContaining({
            amountOfNotes: 0,
          }),
        }),
      }),
    );
    expect(migratedState).not.toHaveProperty("editor");
    expect(migratedState).not.toHaveProperty("journal");
    expect(migratedState).not.toHaveProperty("amountOfNotes");
    expect(migratedState).not.toHaveProperty("activity");
  });

  test("does not auto-assign an unclaimed legacy preferences blob to the active workspace", async () => {
    storage.setItem(
      "preferences-store",
      JSON.stringify({
        state: {
          editor: {
            defaultModeRaw: true,
            defaultPlaceholder: "Legacy placeholder",
          },
          amountOfNotes: 7,
        },
      }),
    );

    authWorkspaceId = "user-a";
    const { usePreferencesStore } = await loadStoreModule();

    await flushMicrotasks();

    usePreferencesStore.getState().initialize();

    expect(usePreferencesStore.getState().workspaceId).toBe("user-a");
    expect(usePreferencesStore.getState().editor.defaultModeRaw).toBe(false);
    expect(usePreferencesStore.getState().editor.defaultPlaceholder).toBe("Start writing...");
    expect(usePreferencesStore.getState().amountOfNotes).toBe(0);

    const persistedState = readPersistedPreferences();
    expect(persistedState).toEqual(
      expect.objectContaining({
        profiles: expect.objectContaining({
          "user-a": expect.objectContaining({
            amountOfNotes: 0,
          }),
        }),
      }),
    );
  });
});
