import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const AUTH_PREFERENCES_KEY = "skriuw:auth:preferences:v1";

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

function installWindow(href = "http://localhost:3000/") {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const url = new URL(href);

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      sessionStorage,
      location: {
        href,
        origin: url.origin,
        pathname: url.pathname,
        search: url.search,
      },
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

describe("auth session state", () => {
  beforeEach(() => {
    rememberMePreference = true;
    setSessionPersistenceCalls = [];
    installWindow();
    registerSupabaseMocks();
  });

  afterEach(() => {
    mock.restore();
    Reflect.deleteProperty(globalThis, "window");
  });

  test("initializes a signed-out session with a stable local workspace id", async () => {
    const { localStorage } = installWindow();
    localStorage.setItem(
      AUTH_PREFERENCES_KEY,
      JSON.stringify({ rememberMe: false }),
    );

    const authModule = await import(
      `@/platform/auth/index?initialize-signed-out=${Math.random().toString(36).slice(2)}`
    );

    const snapshot = await authModule.initializeAuth();

    expect(snapshot).toEqual(
      expect.objectContaining({
        phase: "signed_out",
        workspaceId: "signed-out-local",
        isReady: true,
        user: null,
      }),
    );
    expect(authModule.getWorkspaceId()).toBe("signed-out-local");
    expect(setSessionPersistenceCalls).toEqual([false]);
  });

  test("signing out returns the auth state to signed out", async () => {
    const authModule = await import(
      `@/platform/auth/index?sign-out=${Math.random().toString(36).slice(2)}`
    );

    authModule.resetAuthForTests();
    const snapshot = await authModule.signOut();

    expect(snapshot).toEqual(
      expect.objectContaining({
        phase: "signed_out",
        workspaceId: "signed-out-local",
        user: null,
      }),
    );
  });

  test("builds a stable OAuth callback redirect", async () => {
    installWindow("http://localhost:3000/sign-in?draft=1");
    const authModule = await import(
      `@/platform/auth/index?oauth-redirect-auth-page=${Math.random().toString(36).slice(2)}`
    );

    expect(authModule.getOAuthRedirectTo()).toBe(
      "http://localhost:3000/auth/callback?next=%2Fapp",
    );
  });

  test("preserves app paths as the OAuth callback next target", async () => {
    installWindow("https://skriuw.example/app/journal?entry=42");
    const authModule = await import(
      `@/platform/auth/index?oauth-redirect-app-page=${Math.random().toString(36).slice(2)}`
    );

    expect(authModule.getOAuthRedirectTo()).toBe(
      "https://skriuw.example/auth/callback?next=%2Fapp%2Fjournal%3Fentry%3D42",
    );
  });
});
