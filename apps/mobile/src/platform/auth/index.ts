import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/src/core/persistence/supabase";

export type MobileAuthUser = {
  id: string;
  email: string;
  name: string;
};

export type MobileAuthPhase = "initializing" | "signed_out" | "authenticated";

export type MobileAuthSnapshot = {
  phase: MobileAuthPhase;
  isReady: boolean;
  isSupabaseConfigured: boolean;
  user: MobileAuthUser | null;
  session: Session | null;
  error: string | null;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type OAuthProvider = "google" | "github";

type AuthListener = () => void;

const MISSING_ENV_ERROR =
  "Supabase env vars are missing. Set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or reuse the NEXT_PUBLIC_* values.";

WebBrowser.maybeCompleteAuthSession();

let snapshot: MobileAuthSnapshot = {
  phase: "initializing",
  isReady: false,
  isSupabaseConfigured: isSupabaseConfigured(),
  user: null,
  session: null,
  error: null,
};

let initializePromise: Promise<MobileAuthSnapshot> | null = null;
let authSubscriptionBound = false;
const listeners = new Set<AuthListener>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function toUser(session: Session | null): MobileAuthUser | null {
  const authUser = session?.user;
  if (!authUser) {
    return null;
  }

  return {
    id: authUser.id,
    email: authUser.email ?? "",
    name:
      typeof authUser.user_metadata?.full_name === "string"
        ? authUser.user_metadata.full_name
        : typeof authUser.user_metadata?.name === "string"
          ? authUser.user_metadata.name
          : authUser.email?.split("@")[0] ?? "Signed-in user",
  };
}

function normalizeSnapshot(next: MobileAuthSnapshot): MobileAuthSnapshot {
  return {
    ...next,
    isReady: next.phase !== "initializing",
    isSupabaseConfigured: isSupabaseConfigured(),
  };
}

function setSnapshot(next: MobileAuthSnapshot | ((current: MobileAuthSnapshot) => MobileAuthSnapshot)) {
  const rawSnapshot = typeof next === "function" ? next(snapshot) : next;
  snapshot = normalizeSnapshot(rawSnapshot);
  emit();
  return snapshot;
}

function applySession(session: Session | null) {
  return setSnapshot({
    ...snapshot,
    phase: session?.user ? "authenticated" : "signed_out",
    user: toUser(session),
    session,
    error: null,
  });
}

function setError(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return setSnapshot((current) => ({
    ...current,
    phase: current.session?.user ? "authenticated" : "signed_out",
    error: message,
  }));
}

function setMissingEnvSnapshot() {
  return setSnapshot({
    phase: "signed_out",
    isReady: true,
    isSupabaseConfigured: false,
    user: null,
    session: null,
    error: MISSING_ENV_ERROR,
  });
}

async function ensureAuthSubscription() {
  if (authSubscriptionBound || !isSupabaseConfigured()) {
    return;
  }

  const supabase = getSupabaseClient();
  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });
  authSubscriptionBound = true;
}

export function subscribeAuthState(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthStateSnapshot(): MobileAuthSnapshot {
  return snapshot;
}

export function getCurrentUserId(): string | null {
  return snapshot.user?.id ?? null;
}

export async function initializeAuth(): Promise<MobileAuthSnapshot> {
  if (!isSupabaseConfigured()) {
    return setMissingEnvSnapshot();
  }

  if (!initializePromise) {
    initializePromise = (async () => {
      setSnapshot((current) => ({
        ...current,
        phase: "initializing",
        error: null,
      }));

      try {
        await ensureAuthSubscription();
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        return applySession(data.session);
      } catch (error) {
        initializePromise = null;
        return setError(error);
      }
    })();
  }

  return initializePromise;
}

export async function signIn({ email, password }: SignInInput): Promise<MobileAuthSnapshot> {
  return signInWithPassword({ email, password });
}

export async function signInWithPassword({ email, password }: SignInInput): Promise<MobileAuthSnapshot> {
  await initializeAuth();

  if (!isSupabaseConfigured()) {
    return getAuthStateSnapshot();
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }

    return applySession(data.session);
  } catch (error) {
    return setError(error);
  }
}

export async function signUp({ email, password }: SignInInput): Promise<MobileAuthSnapshot> {
  return signUpWithPassword({ email, password });
}

export async function signUpWithPassword({ email, password }: SignInInput): Promise<MobileAuthSnapshot> {
  await initializeAuth();

  if (!isSupabaseConfigured()) {
    return getAuthStateSnapshot();
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error(
        "Account created, but no session was returned. Disable email confirmation in Supabase to allow immediate sign-in.",
      );
    }

    return applySession(data.session);
  } catch (error) {
    return setError(error);
  }
}

export async function signInWithOAuth(provider: OAuthProvider): Promise<MobileAuthSnapshot> {
  await initializeAuth();

  if (!isSupabaseConfigured()) {
    return getAuthStateSnapshot();
  }

  try {
    const supabase = getSupabaseClient();
    const redirectTo = Linking.createURL("/auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      throw error;
    }

    if (!data?.url) {
      throw new Error("Unable to start OAuth flow.");
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type !== "success" || !result.url) {
      throw new Error("OAuth sign-in was cancelled.");
    }

    const { queryParams } = Linking.parse(result.url);
    const code = typeof queryParams?.code === "string" ? queryParams.code : null;
    const authError =
      typeof queryParams?.error_description === "string"
        ? queryParams.error_description
        : typeof queryParams?.error === "string"
          ? queryParams.error
          : null;

    if (authError) {
      throw new Error(authError);
    }

    if (!code) {
      throw new Error("No OAuth authorization code was returned.");
    }

    const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      throw exchangeError;
    }

    return applySession(sessionData.session);
  } catch (error) {
    return setError(error);
  }
}

export async function signOut(): Promise<MobileAuthSnapshot> {
  await initializeAuth();

  if (!isSupabaseConfigured()) {
    return getAuthStateSnapshot();
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    return applySession(null);
  } catch (error) {
    return setError(error);
  }
}
