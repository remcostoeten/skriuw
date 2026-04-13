import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const AUTH_PREFERENCES_KEY = "haptic:auth:preferences:v1";

type StorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

let rememberMePreference = true;
let setSessionPersistenceCalls: boolean[] = [];

function createStorage(): StorageMock {
  const entries = new Map<string, string>();

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
}

function installWindow() {
  const localStorage = createStorage();
  const sessionStorage = createStorage();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      sessionStorage,
      location: { href: "http://localhost:3000/" },
    },
  });

  return { localStorage, sessionStorage };
}

function registerSupabaseMocks() {
  const supabaseModuleMock = {
    getStoredRememberMePreference: () => rememberMePreference,
    getSupabaseClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
    }),
    isSupabaseConfigured: () => false,
    setSupabaseSessionPersistence: (rememberMe: boolean) => {
      setSessionPersistenceCalls.push(rememberMe);
    },
    canUseRemotePersistence: () => false,
    getRemotePersistenceUserId: () => null,
    getRemoteRecord: async () => undefined,
    listRemoteRecords: async () => [],
    putRemoteRecord: async () => undefined,
    softDeleteRemoteRecord: async () => undefined,
    softDeleteRemoteRecords: async () => undefined,
    pullAllFromRemote: async () => undefined,
    pushAllToRemote: async () => undefined,
    pushRecordToRemote: async () => undefined,
    deleteRecordFromRemote: async () => undefined,
    getLastSyncTime: () => null,
    SUPABASE_AUTH_STORAGE_KEY: "supabase.auth.token",
  };

  mock.module("@/core/persistence/supabase", () => supabaseModuleMock);
  mock.module("@/core/persistence/supabase/index", () => supabaseModuleMock);
}

describe("auth actor isolation", () => {
  beforeEach(() => {
    rememberMePreference = true;
    setSessionPersistenceCalls = [];
    installWindow();
    registerSupabaseMocks();
  });

  afterEach(async () => {
    mock.restore();
    Reflect.deleteProperty(globalThis, "window");
  });

  test("initializes signed-out account mode with a distinct local actor id", async () => {
    const { localStorage } = installWindow();
    localStorage.setItem(
      AUTH_PREFERENCES_KEY,
      JSON.stringify({ mode: "account", rememberMe: false }),
    );

    const authModule = await import(`../index?initialize-account=${Math.random().toString(36).slice(2)}`);

    const snapshot = await authModule.initializeAuth();

    expect(snapshot).toEqual(
      expect.objectContaining({
        mode: "account",
        status: "signed_out",
        actorId: "account-local",
        isReady: true,
        canSync: false,
        user: null,
      }),
    );
    expect(authModule.getAuthActorId()).toBe("account-local");
    expect(setSessionPersistenceCalls).toEqual([false]);
  });

  test("uses a distinct local actor for signed-out account mode", async () => {
    const authModule = await import(`../index?account-actor=${Math.random().toString(36).slice(2)}`);

    authModule.resetAuthForTests();
    await authModule.enableAccountMode();

    expect(authModule.getAuthStateSnapshot()).toEqual(
      expect.objectContaining({
        mode: "account",
        status: "signed_out",
        actorId: "account-local",
      }),
    );
  });

  test("switches back to the privacy actor when privacy mode is enabled", async () => {
    const authModule = await import(`../index?privacy-actor=${Math.random().toString(36).slice(2)}`);

    authModule.resetAuthForTests();
    await authModule.enableAccountMode();
    await authModule.setPrivacyMode();

    expect(authModule.getAuthStateSnapshot()).toEqual(
      expect.objectContaining({
        mode: "privacy",
        status: "privacy",
        actorId: "privacy-local",
      }),
    );
  });
});
