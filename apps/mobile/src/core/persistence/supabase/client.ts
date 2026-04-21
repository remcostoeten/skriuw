import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, type AppStateStatus, Platform } from "react-native";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_AUTH_STORAGE_KEY = "skriuw:mobile:supabase-auth";

let client: SupabaseClient | null = null;
let appStateBound = false;
let lastAppState: AppStateStatus = AppState.currentState;

function bindAppStateAutoRefresh(supabase: SupabaseClient) {
  if (appStateBound || Platform.OS === "web") {
    return;
  }

  AppState.addEventListener("change", (nextAppState) => {
    if (nextAppState === lastAppState) {
      return;
    }

    if (nextAppState === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }

    lastAppState = nextAppState;
  });

  if (lastAppState === "active") {
    supabase.auth.startAutoRefresh();
  }

  appStateBound = true;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    if (!isSupabaseConfigured()) {
      throw new Error(
        "Supabase env vars are missing. Set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or reuse the NEXT_PUBLIC_* values.",
      );
    }

    client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
        storage: AsyncStorage,
      },
    });

    bindAppStateAutoRefresh(client);
  }

  return client;
}
