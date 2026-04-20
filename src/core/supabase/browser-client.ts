import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const REMEMBER_ME_KEY = "skriuw:auth:remember-me:v1";

let client: SupabaseClient | null = null;

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

  try {
    window.localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "1" : "0");
  } catch {
    // Ignore storage errors.
  }
}

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    if (!isSupabaseConfigured()) {
      throw new Error(
        "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }

    client = createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  }

  return client;
}
