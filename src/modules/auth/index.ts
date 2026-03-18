import type { Session } from "@supabase/supabase-js";
import {
  getStoredRememberMePreference,
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseSessionPersistence,
} from "@/core/persistence/supabase";

export type User = {
  id: string;
  email: string;
  name: string;
};

export type AuthMode = "privacy" | "account";
export type AuthStatus = "initializing" | "privacy" | "signed_out" | "authenticated";
export type OAuthProvider = "google" | "github";

export type AuthSnapshot = {
  mode: AuthMode;
  status: AuthStatus;
  rememberMe: boolean;
  isReady: boolean;
  isSupabaseConfigured: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
  actorId: string;
  canSync: boolean;
};

type AuthPreferences = {
  mode: AuthMode;
  rememberMe: boolean;
};

type AuthListener = () => void;

const AUTH_PREFERENCES_KEY = "haptic:auth:preferences:v1";
const PRIVACY_ACTOR_ID = "privacy-local";

let snapshot: AuthSnapshot = {
  mode: "privacy",
  status: "initializing",
  rememberMe: true,
  isReady: typeof window === "undefined",
  isSupabaseConfigured: isSupabaseConfigured(),
  user: null,
  session: null,
  error: null,
  actorId: PRIVACY_ACTOR_ID,
  canSync: false,
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
    return { mode: "privacy", rememberMe: true };
  }

  try {
    const raw = window.localStorage.getItem(AUTH_PREFERENCES_KEY);
    if (!raw) {
      return {
        mode: "privacy",
        rememberMe: getStoredRememberMePreference(),
      };
    }

    const parsed = JSON.parse(raw) as Partial<AuthPreferences>;
    return {
      mode: parsed.mode === "account" ? "account" : "privacy",
      rememberMe:
        typeof parsed.rememberMe === "boolean"
          ? parsed.rememberMe
          : getStoredRememberMePreference(),
    };
  } catch {
    return {
      mode: "privacy",
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

function setSnapshot(
  next:
    | AuthSnapshot
    | ((current: AuthSnapshot) => AuthSnapshot),
): AuthSnapshot {
  snapshot = typeof next === "function" ? next(snapshot) : next;
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

function applySession(session: Session | null, modeOverride?: AuthMode): AuthSnapshot {
  const user = toUser(session);
  const preferredMode = modeOverride ?? snapshot.mode;
  const nextMode = user ? "account" : preferredMode;
  const nextSnapshot: AuthSnapshot = {
    ...snapshot,
    mode: nextMode,
    status: user ? "authenticated" : nextMode === "privacy" ? "privacy" : "signed_out",
    isReady: true,
    isSupabaseConfigured: isSupabaseConfigured(),
    user,
    session,
    error: null,
    actorId: user?.id ?? PRIVACY_ACTOR_ID,
    canSync: Boolean(user) && isSupabaseConfigured(),
  };

  return setSnapshot(nextSnapshot);
}

function updatePreferences(nextPreferences: Partial<AuthPreferences>): AuthPreferences {
  const merged = {
    mode: nextPreferences.mode ?? snapshot.mode,
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
        mode: preferences.mode,
        rememberMe: preferences.rememberMe,
        isSupabaseConfigured: isSupabaseConfigured(),
      }));

      if (!isSupabaseConfigured()) {
        return applySession(null, preferences.mode);
      }

      await ensureAuthSubscription();

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setError(error);
      }

      return applySession(data.session, preferences.mode);
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

export async function setPrivacyMode(): Promise<AuthSnapshot> {
  updatePreferences({ mode: "privacy" });
  clearError();

  if (isSupabaseConfigured() && snapshot.session) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error);
    }
  }

  return applySession(null, "privacy");
}

export async function enableAccountMode(): Promise<AuthSnapshot> {
  updatePreferences({ mode: "account" });
  clearError();

  return setSnapshot((current) => ({
    ...current,
    mode: "account",
    status: current.user ? "authenticated" : "signed_out",
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
  updatePreferences({ mode: "account" });
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

  return applySession(data.session, "account");
}

export async function signUpWithPassword(input: EmailAuthInput): Promise<AuthSnapshot> {
  await initializeAuth();
  requireConfiguredSupabase();
  await setRememberMe(input.rememberMe);
  updatePreferences({ mode: "account" });
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

  return applySession(data.session, "account");
}

export async function signInWithOAuth(
  provider: OAuthProvider,
  options: { rememberMe: boolean },
): Promise<void> {
  await initializeAuth();
  requireConfiguredSupabase();
  await setRememberMe(options.rememberMe);
  updatePreferences({ mode: "account" });
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
    return applySession(null, "account");
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    setError(error);
    throw error;
  }

  return applySession(null, "account");
}

export function getAuth(): User | null {
  return snapshot.user;
}

export function requireUser(): User {
  const user = getAuth();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}

export function isAuthenticated(): boolean {
  return snapshot.user !== null;
}

export function canSyncToRemote(): boolean {
  return snapshot.canSync;
}

export function getAuthActorId(): string {
  return snapshot.actorId;
}

export function resetAuthForTests(): void {
  initializePromise = null;
  authSubscriptionBound = false;
  listeners.clear();
  snapshot = {
    mode: "privacy",
    status: "initializing",
    rememberMe: true,
    isReady: true,
    isSupabaseConfigured: isSupabaseConfigured(),
    user: null,
    session: null,
    error: null,
    actorId: PRIVACY_ACTOR_ID,
    canSync: false,
  };
}
