import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthSnapshot } from "@/platform/auth";

type EffectRecord = {
  deps: unknown[] | undefined;
  cleanup?: void | (() => void);
};

type MockFn = (...args: any[]) => any;
const createMock = mock as unknown as (implementation: MockFn) => MockFn;

let authSnapshot: AuthSnapshot;
let resetNotesWorkspace: MockFn;
let initializeNotes: MockFn;
let syncPreferencesActor: MockFn;
let syncLayoutActor: MockFn;
let syncSidebarActor: MockFn;
let ensureCloudStarterContentSeeded: MockFn;
let initializeAuth: MockFn;
let renderedEffects: EffectRecord[][] = [];
let currentRenderEffects: EffectRecord[] = [];
let effectCursor = 0;

function depsChanged(previous: unknown[] | undefined, next: unknown[] | undefined) {
  if (!previous || !next) {
    return true;
  }

  if (previous.length !== next.length) {
    return true;
  }

  return next.some((dependency, index) => !Object.is(dependency, previous[index]));
}

function renderComponent(Component: () => null) {
  effectCursor = 0;
  currentRenderEffects = [];
  const result = Component();
  renderedEffects.push(currentRenderEffects);
  return result;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function registerModuleMocks() {
  mock.module("react", () => ({
    useEffect: (callback: () => void | (() => void), deps?: unknown[]) => {
      const index = effectCursor++;
      const previousRender = renderedEffects.at(-1);
      const previousEffect = previousRender?.[index];

      if (!previousEffect || depsChanged(previousEffect.deps, deps)) {
        previousEffect?.cleanup?.();
        const cleanup = callback();
        currentRenderEffects[index] = { deps, cleanup };
        return;
      }

      currentRenderEffects[index] = previousEffect;
    },
  }));

  mock.module("@/platform/auth/use-auth", () => ({
    useAuthSnapshot: () => authSnapshot,
  }));

  mock.module("@/platform/auth", () => ({
    getWorkspaceId: () => authSnapshot.workspaceId,
    getAuthStateSnapshot: () => authSnapshot,
    subscribeAuthState: () => () => undefined,
    initializeAuth: () => initializeAuth(),
  }));

  mock.module("@/features/notes/store", () => ({
    useNotesStore: (
      selector: (state: {
        resetWorkspace: typeof resetNotesWorkspace;
        initialize: typeof initializeNotes;
      }) => unknown,
    ) =>
      selector({
        resetWorkspace: resetNotesWorkspace,
        initialize: initializeNotes,
      }),
  }));

  mock.module("@/features/settings/store", () => ({
    usePreferencesStore: (
      selector: (state: { syncWorkspace: typeof syncPreferencesActor }) => unknown,
    ) => selector({ syncWorkspace: syncPreferencesActor }),
  }));

  mock.module("@/features/layout/store", () => ({
    useDocumentStore: (
      selector: (state: { syncWorkspace: typeof syncLayoutActor }) => unknown,
    ) => selector({ syncWorkspace: syncLayoutActor }),
  }));

  mock.module("@/features/notes/components/sidebar/store", () => ({
    useSidebarStore: (
      selector: (state: { syncWorkspace: typeof syncSidebarActor }) => unknown,
    ) => selector({ syncWorkspace: syncSidebarActor }),
  }));

  mock.module("@/core/persistence/starter-content", () => ({
    ensureCloudStarterContentSeeded: (userId: string) =>
      ensureCloudStarterContentSeeded(userId),
  }));
}

beforeEach(() => {
  authSnapshot = {
    phase: "authenticated",
    rememberMe: true,
    isReady: true,
    isSupabaseConfigured: true,
    user: {
      id: "user-a",
      email: "user-a@example.com",
      name: "User A",
    },
    session: null,
    error: null,
    workspaceId: "user-a",
  };

  resetNotesWorkspace = createMock(() => undefined);
  initializeNotes = createMock(async () => undefined);
  syncPreferencesActor = createMock(() => undefined);
  syncLayoutActor = createMock(async () => undefined);
  syncSidebarActor = createMock(async () => undefined);
  ensureCloudStarterContentSeeded = createMock(async () => undefined);
  initializeAuth = createMock(async () => authSnapshot);
  renderedEffects = [];
  currentRenderEffects = [];
  effectCursor = 0;
});

afterEach(() => {
  mock.restore();
});

describe("PersistenceBootstrap", () => {
  test("re-initializes persisted state when the authenticated workspace changes", async () => {
    registerModuleMocks();

    const { PersistenceBootstrap } = await import(
      `@/shared/components/persistence-bootstrap?workspace-switch=${Math.random().toString(36).slice(2)}`
    );

    renderComponent(PersistenceBootstrap);
    await flushMicrotasks();

    expect(resetNotesWorkspace).toHaveBeenCalledTimes(1);
    expect(initializeNotes).toHaveBeenCalledTimes(1);
    expect(resetNotesWorkspace).toHaveBeenCalledTimes(1);
    expect(initializeNotes).toHaveBeenCalledWith("user-a");
    expect(syncPreferencesActor).toHaveBeenCalledWith("user-a");
    expect(syncLayoutActor).toHaveBeenCalledWith("user-a");
    expect(syncSidebarActor).toHaveBeenCalledWith("user-a");
    expect(ensureCloudStarterContentSeeded).toHaveBeenCalledWith("user-a");

    authSnapshot = {
      ...authSnapshot,
      user: {
        id: "user-b",
        email: "user-b@example.com",
        name: "User B",
      },
      workspaceId: "user-b",
    };

    renderComponent(PersistenceBootstrap);
    await flushMicrotasks();

    expect(renderedEffects).toHaveLength(2);
    expect(resetNotesWorkspace).toHaveBeenCalledTimes(2);
    expect(initializeNotes).toHaveBeenCalledTimes(2);
    expect(resetNotesWorkspace).toHaveBeenLastCalledWith();
    expect(initializeNotes).toHaveBeenLastCalledWith("user-b");
    expect(syncPreferencesActor).toHaveBeenLastCalledWith("user-b");
    expect(syncLayoutActor).toHaveBeenLastCalledWith("user-b");
    expect(syncSidebarActor).toHaveBeenLastCalledWith("user-b");
    expect(ensureCloudStarterContentSeeded).toHaveBeenLastCalledWith("user-b");
  });

  test("does not initialize workspace data while signed out", async () => {
    authSnapshot = {
      ...authSnapshot,
      phase: "signed_out",
      user: null,
      workspaceId: "signed-out-local",
    };

    registerModuleMocks();

    const { PersistenceBootstrap } = await import(
      `@/shared/components/persistence-bootstrap?signed-out=${Math.random().toString(36).slice(2)}`
    );

    renderComponent(PersistenceBootstrap);
    await flushMicrotasks();

    expect(resetNotesWorkspace).toHaveBeenCalledWith();
    expect(ensureCloudStarterContentSeeded).not.toHaveBeenCalled();
    expect(initializeNotes).not.toHaveBeenCalled();
    expect(syncPreferencesActor).not.toHaveBeenCalled();
    expect(syncLayoutActor).not.toHaveBeenCalled();
    expect(syncSidebarActor).not.toHaveBeenCalled();
  });
});
