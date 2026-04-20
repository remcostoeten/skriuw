import { createClient, type SupportedStorage, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const REMEMBER_ME_KEY = "skriuw:auth:remember-me:v1";
export const SUPABASE_AUTH_STORAGE_KEY = "skriuw:supabase-auth";

let client: SupabaseClient | null = null;

function readStorage(storage: Storage | undefined, key: string): string | null {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    // Ignore browser storage write errors so guest mode keeps working.
  }
}

function removeStorage(storage: Storage | undefined, key: string): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore browser storage removal errors.
  }
}

function getPreferredAuthStorage(rememberMe = getStoredRememberMePreference()): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return rememberMe ? window.localStorage : window.sessionStorage;
}

function getSecondaryAuthStorage(rememberMe = getStoredRememberMePreference()): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return rememberMe ? window.sessionStorage : window.localStorage;
}

const authStorage: SupportedStorage = {
  getItem(key) {
    const primary = getPreferredAuthStorage();
    const fallback = getSecondaryAuthStorage();

    return readStorage(primary, key) ?? readStorage(fallback, key);
  },
  setItem(key, value) {
    const primary = getPreferredAuthStorage();
    const fallback = getSecondaryAuthStorage();

    writeStorage(primary, key, value);
    removeStorage(fallback, key);
  },
  removeItem(key) {
    removeStorage(getPreferredAuthStorage(), key);
    removeStorage(getSecondaryAuthStorage(), key);
  },
};

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getStoredRememberMePreference(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(REMEMBER_ME_KEY);
    return raw !== "0";
  } catch {
    return true;
  }
}

export function setSupabaseSessionPersistence(rememberMe: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  writeStorage(window.localStorage, REMEMBER_ME_KEY, rememberMe ? "1" : "0");

  const localValue = readStorage(window.localStorage, SUPABASE_AUTH_STORAGE_KEY);
  const sessionValue = readStorage(window.sessionStorage, SUPABASE_AUTH_STORAGE_KEY);
  const activeValue = localValue ?? sessionValue;
  const primary = getPreferredAuthStorage(rememberMe);
  const fallback = getSecondaryAuthStorage(rememberMe);

  if (activeValue !== null) {
    writeStorage(primary, SUPABASE_AUTH_STORAGE_KEY, activeValue);
  }

  removeStorage(fallback, SUPABASE_AUTH_STORAGE_KEY);
}

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    if (!isSupabaseConfigured()) {
      throw new Error(
        "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }

    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
        storage: authStorage,
      },
    });
  }

  return client;
}
