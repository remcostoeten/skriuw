import type { Session } from "@supabase/supabase-js";
import {
  getStoredRememberMePreference,
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseSessionPersistence,
} from "@/core/persistence/supabase";

type User = {
  id: string;
  email: string;
  name: string;
};

type AuthPhase = "initializing" | "signed_out" | "authenticated";
type OAuthProvider = "google" | "github";

export type AuthSnapshot = {
  phase: AuthPhase;
  rememberMe: boolean;
  isReady: boolean;
  isSupabaseConfigured: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
  workspaceId: string;
};

type AuthPreferences = {
  rememberMe: boolean;
};

type AuthListener = () => void;

const AUTH_PREFERENCES_KEY = "skriuw:auth:preferences:v1";
const SIGNED_OUT_WORKSPACE_ID = "signed-out-local";
const INITIAL_PHASE: AuthPhase = typeof window === "undefined" ? "signed_out" : "initializing";

let snapshot: AuthSnapshot = {
  phase: INITIAL_PHASE,
  rememberMe: true,
  isReady: typeof window === "undefined",
  isSupabaseConfigured: isSupabaseConfigured(),
  user: null,
  session: null,
  error: null,
  workspaceId: SIGNED_OUT_WORKSPACE_ID,
};

let initializePromise: Promise<AuthSnapshot> | null = null;
let authSubscriptionBound = false;
const listeners = new Set<AuthListener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function toUser(session: Session | null): User | null {
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

function readPreferences(): AuthPreferences {
  if (typeof window === "undefined") {
    return { rememberMe: true };
  }

  try {
    const raw = window.localStorage.getItem(AUTH_PREFERENCES_KEY);
    if (!raw) {
      return {
        rememberMe: getStoredRememberMePreference(),
      };
    }

    const parsed = JSON.parse(raw) as {
      rememberMe?: boolean;
    };
    return {
      rememberMe:
        typeof parsed.rememberMe === "boolean"
          ? parsed.rememberMe
          : getStoredRememberMePreference(),
    };
  } catch {
    return {
      rememberMe: getStoredRememberMePreference(),
    };
  }
}

function persistPreferences(preferences: AuthPreferences): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_PREFERENCES_KEY, JSON.stringify(preferences));
}

function getDerivedWorkspaceId(user: User | null): string {
  return user?.id ?? SIGNED_OUT_WORKSPACE_ID;
}

function normalizeSnapshot(next: AuthSnapshot): AuthSnapshot {
  return {
    ...next,
    isReady: next.phase !== "initializing",
    workspaceId: getDerivedWorkspaceId(next.user),
  };
}

function setSnapshot(
  next:
    | AuthSnapshot
    | ((current: AuthSnapshot) => AuthSnapshot),
): AuthSnapshot {
  const rawSnapshot = typeof next === "function" ? next(snapshot) : next;
  snapshot = normalizeSnapshot(rawSnapshot);
  emit();
  return snapshot;
}

function setError(error: unknown): void {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  setSnapshot((current) => ({ ...current, error: message }));
}

function clearError(): void {
  if (snapshot.error) {
    setSnapshot((current) => ({ ...current, error: null }));
  }
}

function applySession(session: Session | null): AuthSnapshot {
  const user = toUser(session);
  const phase = user ? "authenticated" : "signed_out";

  return setSnapshot({
    ...snapshot,
    phase,
    isSupabaseConfigured: isSupabaseConfigured(),
    user,
    session,
    error: null,
  });
}

function updatePreferences(nextPreferences: Partial<AuthPreferences>): AuthPreferences {
  const merged = {
    rememberMe: nextPreferences.rememberMe ?? snapshot.rememberMe,
  } satisfies AuthPreferences;

  persistPreferences(merged);
  return merged;
}

async function ensureAuthSubscription(): Promise<void> {
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

export function getAuthStateSnapshot(): AuthSnapshot {
  return snapshot;
}

export async function initializeAuth(): Promise<AuthSnapshot> {
  if (typeof window === "undefined") {
    return snapshot;
  }

  if (!initializePromise) {
    initializePromise = (async () => {
      const preferences = readPreferences();
      setSupabaseSessionPersistence(preferences.rememberMe);
      setSnapshot((current) => ({
        ...current,
        rememberMe: preferences.rememberMe,
        isSupabaseConfigured: isSupabaseConfigured(),
      }));

      if (!isSupabaseConfigured()) {
        return applySession(null);
      }

      await ensureAuthSubscription();

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setError(error);
      }

      return applySession(data.session);
    })();
  }

  return initializePromise;
}

export async function setRememberMe(rememberMe: boolean): Promise<AuthSnapshot> {
  const preferences = updatePreferences({ rememberMe });
  setSupabaseSessionPersistence(preferences.rememberMe);

  return setSnapshot((current) => ({
    ...current,
    rememberMe: preferences.rememberMe,
  }));
}

type EmailAuthInput = {
  email: string;
  password: string;
  rememberMe: boolean;
};

function requireConfiguredSupabase(): void {
  if (!isSupabaseConfigured()) {
    throw new Error("Cloud auth is not configured. Add the Supabase env vars to enable sign-in.");
  }
}

export async function signInWithPassword(input: EmailAuthInput): Promise<AuthSnapshot> {
  await initializeAuth();
  requireConfiguredSupabase();
  await setRememberMe(input.rememberMe);
  clearError();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    setError(error);
    throw error;
  }

  return applySession(data.session);
}

export async function signUpWithPassword(input: EmailAuthInput): Promise<AuthSnapshot> {
  await initializeAuth();
  requireConfiguredSupabase();
  await setRememberMe(input.rememberMe);
  clearError();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
  });

  if (error) {
    setError(error);
    throw error;
  }

  if (!data.session) {
    throw new Error(
      "Account created, but no session was returned. Disable email confirmation in Supabase to allow immediate sign-in.",
    );
  }

  return applySession(data.session);
}

export async function signInWithOAuth(
  provider: OAuthProvider,
  options: { rememberMe: boolean },
): Promise<void> {
  await initializeAuth();
  requireConfiguredSupabase();
  await setRememberMe(options.rememberMe);
  clearError();

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: typeof window === "undefined" ? undefined : window.location.href,
    },
  });

  if (error) {
    setError(error);
    throw error;
  }
}

export async function signOut(): Promise<AuthSnapshot> {
  await initializeAuth();
  clearError();

  if (!isSupabaseConfigured()) {
    return applySession(null);
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    setError(error);
    throw error;
  }

  return applySession(null);
}

export function getWorkspaceId(): string {
  return getDerivedWorkspaceId(snapshot.user);
}

export function resetAuthForTests(): void {
  initializePromise = null;
  authSubscriptionBound = false;
  listeners.clear();
  snapshot = normalizeSnapshot({
    phase: "initializing",
    rememberMe: true,
    isReady: false,
    isSupabaseConfigured: isSupabaseConfigured(),
    user: null,
    session: null,
    error: null,
    workspaceId: SIGNED_OUT_WORKSPACE_ID,
  });
}
