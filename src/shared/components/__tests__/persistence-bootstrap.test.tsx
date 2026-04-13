import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthSnapshot } from "@/platform/auth";

type EffectRecord = {
  deps: unknown[] | undefined;
  cleanup?: void | (() => void);
};

let authSnapshot: AuthSnapshot;
let beginNotesActorTransition: ReturnType<typeof mock>;
let initializeNotes: ReturnType<typeof mock>;
let beginJournalActorTransition: ReturnType<typeof mock>;
let initializeJournal: ReturnType<typeof mock>;
let syncPreferencesActor: ReturnType<typeof mock>;
let syncLayoutActor: ReturnType<typeof mock>;
let syncSidebarActor: ReturnType<typeof mock>;
let ensurePrivacyDemoSeeded: ReturnType<typeof mock>;
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
    getAuthActorId: () => authSnapshot.actorId,
    getAuthStateSnapshot: () => authSnapshot,
    subscribeAuthState: () => () => undefined,
  }));

  mock.module("@/features/notes/store", () => ({
    useNotesStore: (
      selector: (state: {
        beginActorTransition: typeof beginNotesActorTransition;
        initialize: typeof initializeNotes;
      }) => unknown,
    ) =>
      selector({
        beginActorTransition: beginNotesActorTransition,
        initialize: initializeNotes,
      }),
  }));

  mock.module("@/features/journal/store", () => ({
    useJournalStore: (
      selector: (state: {
        beginActorTransition: typeof beginJournalActorTransition;
        initialize: typeof initializeJournal;
      }) => unknown,
    ) =>
      selector({
        beginActorTransition: beginJournalActorTransition,
        initialize: initializeJournal,
      }),
  }));

  mock.module("@/features/settings/store", () => ({
    usePreferencesStore: (
      selector: (state: { syncActor: typeof syncPreferencesActor }) => unknown,
    ) => selector({ syncActor: syncPreferencesActor }),
  }));

  mock.module("@/features/layout/store", () => ({
    useDocumentStore: (
      selector: (state: { syncActor: typeof syncLayoutActor }) => unknown,
    ) => selector({ syncActor: syncLayoutActor }),
  }));

  mock.module("@/features/notes/components/sidebar/store", () => ({
    useSidebarStore: (
      selector: (state: { syncActor: typeof syncSidebarActor }) => unknown,
    ) => selector({ syncActor: syncSidebarActor }),
  }));

  mock.module("@/core/persistence/repositories/privacy-demo", () => ({
    ensurePrivacyDemoSeeded: (actorId: string) => ensurePrivacyDemoSeeded(actorId),
  }));
}

beforeEach(() => {
  authSnapshot = {
    mode: "account",
    status: "authenticated",
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
    actorId: "user-a",
    canSync: true,
  };

  beginNotesActorTransition = mock(() => undefined);
  initializeNotes = mock(async () => undefined);
  beginJournalActorTransition = mock(() => undefined);
  initializeJournal = mock(async () => undefined);
  syncPreferencesActor = mock(() => undefined);
  syncLayoutActor = mock(async () => undefined);
  syncSidebarActor = mock(async () => undefined);
  ensurePrivacyDemoSeeded = mock(async () => undefined);
  renderedEffects = [];
  currentRenderEffects = [];
  effectCursor = 0;
});

afterEach(() => {
  mock.restore();
});

describe("PersistenceBootstrap", () => {
  test("re-initializes persisted state when the authenticated actor changes", async () => {
    registerModuleMocks();

    const { PersistenceBootstrap } = await import(
      `../persistence-bootstrap?actor-switch=${Math.random().toString(36).slice(2)}`
    );

    renderComponent(PersistenceBootstrap);

    expect(beginNotesActorTransition).toHaveBeenCalledTimes(1);
    expect(beginJournalActorTransition).toHaveBeenCalledTimes(1);
    expect(initializeNotes).toHaveBeenCalledTimes(1);
    expect(initializeJournal).toHaveBeenCalledTimes(1);
    expect(beginNotesActorTransition).toHaveBeenCalledWith("user-a");
    expect(beginJournalActorTransition).toHaveBeenCalledWith("user-a");
    expect(initializeNotes).toHaveBeenCalledWith("user-a");
    expect(initializeJournal).toHaveBeenCalledWith("user-a");
    expect(syncPreferencesActor).toHaveBeenCalledWith("user-a");
    expect(syncLayoutActor).toHaveBeenCalledWith("user-a");
    expect(syncSidebarActor).toHaveBeenCalledWith("user-a");

    authSnapshot = {
      ...authSnapshot,
      user: {
        id: "user-b",
        email: "user-b@example.com",
        name: "User B",
      },
      actorId: "user-b",
    };

    renderComponent(PersistenceBootstrap);

    expect(renderedEffects).toHaveLength(2);
    expect(beginNotesActorTransition).toHaveBeenCalledTimes(2);
    expect(beginJournalActorTransition).toHaveBeenCalledTimes(2);
    expect(initializeNotes).toHaveBeenCalledTimes(2);
    expect(initializeJournal).toHaveBeenCalledTimes(2);
    expect(beginNotesActorTransition).toHaveBeenLastCalledWith("user-b");
    expect(beginJournalActorTransition).toHaveBeenLastCalledWith("user-b");
    expect(initializeNotes).toHaveBeenLastCalledWith("user-b");
    expect(initializeJournal).toHaveBeenLastCalledWith("user-b");
    expect(syncPreferencesActor).toHaveBeenLastCalledWith("user-b");
    expect(syncLayoutActor).toHaveBeenLastCalledWith("user-b");
    expect(syncSidebarActor).toHaveBeenLastCalledWith("user-b");
    expect(ensurePrivacyDemoSeeded).not.toHaveBeenCalled();
  });

  test("cancels stale privacy-mode initialization when the actor changes mid-transition", async () => {
    const privacySeedResolvers = new Map<string, () => void>();

    authSnapshot = {
      ...authSnapshot,
      mode: "privacy",
      actorId: "user-a",
      user: null,
      canSync: false,
    };
    ensurePrivacyDemoSeeded = mock(
      (actorId: string) =>
        new Promise<void>((resolve) => {
          privacySeedResolvers.set(actorId, resolve);
        }),
    );

    registerModuleMocks();

    const { PersistenceBootstrap } = await import(
      `../persistence-bootstrap?privacy-transition=${Math.random().toString(36).slice(2)}`
    );

    renderComponent(PersistenceBootstrap);

    expect(beginNotesActorTransition).toHaveBeenCalledWith("user-a");
    expect(beginJournalActorTransition).toHaveBeenCalledWith("user-a");
    expect(ensurePrivacyDemoSeeded).toHaveBeenCalledWith("user-a");
    expect(initializeNotes).not.toHaveBeenCalled();
    expect(initializeJournal).not.toHaveBeenCalled();

    authSnapshot = {
      ...authSnapshot,
      actorId: "user-b",
    };

    renderComponent(PersistenceBootstrap);

    expect(beginNotesActorTransition).toHaveBeenLastCalledWith("user-b");
    expect(beginJournalActorTransition).toHaveBeenLastCalledWith("user-b");
    expect(ensurePrivacyDemoSeeded).toHaveBeenLastCalledWith("user-b");
    expect(initializeNotes).not.toHaveBeenCalled();
    expect(initializeJournal).not.toHaveBeenCalled();

    privacySeedResolvers.get("user-a")?.();
    await flushMicrotasks();

    expect(initializeNotes).not.toHaveBeenCalled();
    expect(initializeJournal).not.toHaveBeenCalled();

    privacySeedResolvers.get("user-b")?.();
    await flushMicrotasks();

    expect(initializeNotes).toHaveBeenCalledTimes(1);
    expect(initializeJournal).toHaveBeenCalledTimes(1);
    expect(initializeNotes).toHaveBeenCalledWith("user-b");
    expect(initializeJournal).toHaveBeenCalledWith("user-b");
  });

  test("does not hydrate local state while account mode is signed out", async () => {
    authSnapshot = {
      ...authSnapshot,
      mode: "account",
      status: "signed_out",
      user: null,
      actorId: "account-local",
      canSync: false,
    };

    registerModuleMocks();

    const { PersistenceBootstrap } = await import(
      `../persistence-bootstrap?signed-out=${Math.random().toString(36).slice(2)}`
    );

    renderComponent(PersistenceBootstrap);

    expect(beginNotesActorTransition).toHaveBeenCalledWith("account-local");
    expect(beginJournalActorTransition).toHaveBeenCalledWith("account-local");
    expect(initializeNotes).not.toHaveBeenCalled();
    expect(initializeJournal).not.toHaveBeenCalled();
    expect(syncPreferencesActor).not.toHaveBeenCalled();
    expect(syncLayoutActor).toHaveBeenCalledWith("account-local");
    expect(syncSidebarActor).toHaveBeenCalledWith("account-local");
    expect(ensurePrivacyDemoSeeded).not.toHaveBeenCalled();
  });
});
