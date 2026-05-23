import { authClient } from "@/lib/auth-client";

type User = {
	id: string;
	email: string;
	name: string;
	role: string | null;
};

type AuthPhase = "initializing" | "signed_out" | "authenticated";
type OAuthProvider = "github";

export type AuthSession = {
	user: User;
};

export type AuthSnapshot = {
	phase: AuthPhase;
	rememberMe: boolean;
	isReady: boolean;
	isAuthConfigured: boolean;
	user: User | null;
	session: AuthSession | null;
	error: string | null;
	workspaceId: string;
};

type AuthPreferences = {
	rememberMe: boolean;
};

type AuthListener = () => void;

const AUTH_PREFERENCES_KEY = "skriuw:auth:preferences:v1";
const SIGNED_OUT_WORKSPACE_ID = "signed-out-local";

let snapshot: AuthSnapshot = {
	phase: "signed_out",
	rememberMe: true,
	isReady: true,
	isAuthConfigured: true,
	user: null,
	session: null,
	error: null,
	workspaceId: SIGNED_OUT_WORKSPACE_ID,
};

let initializePromise: Promise<AuthSnapshot> | null = null;
const listeners = new Set<AuthListener>();

function emit(): void {
	for (const listener of listeners) {
		listener();
	}
}

function readPreferences(): AuthPreferences {
	if (typeof window === "undefined") {
		return { rememberMe: true };
	}

	try {
		const raw = window.localStorage.getItem(AUTH_PREFERENCES_KEY);
		if (!raw) return { rememberMe: true };
		const parsed = JSON.parse(raw) as { rememberMe?: boolean };
		return {
			rememberMe: typeof parsed.rememberMe === "boolean" ? parsed.rememberMe : true,
		};
	} catch {
		return { rememberMe: true };
	}
}

function persistPreferences(preferences: AuthPreferences): void {
	if (typeof window === "undefined") return;
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

function setSnapshot(next: AuthSnapshot | ((current: AuthSnapshot) => AuthSnapshot)): AuthSnapshot {
	const raw = typeof next === "function" ? next(snapshot) : next;
	snapshot = normalizeSnapshot(raw);
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

type BetterAuthUser = {
	id: string;
	email: string;
	name?: string | null;
	role?: string | null;
};

function toUser(rawUser: BetterAuthUser | null | undefined): User | null {
	if (!rawUser) return null;
	return {
		id: rawUser.id,
		email: rawUser.email ?? "",
		name: rawUser.name?.trim() || rawUser.email?.split("@")[0] || "Signed-in user",
		role: rawUser.role ?? null,
	};
}

function applySession(rawUser: BetterAuthUser | null | undefined): AuthSnapshot {
	const user = toUser(rawUser);
	return setSnapshot({
		...snapshot,
		phase: user ? "authenticated" : "signed_out",
		user,
		session: user ? { user } : null,
		error: null,
	});
}

async function refreshSession(): Promise<AuthSnapshot> {
	try {
		const { data } = await authClient.getSession();
		return applySession(data?.user ?? null);
	} catch (error) {
		setError(error);
		return applySession(null);
	}
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
			const prefs = readPreferences();
			setSnapshot((current) => ({ ...current, rememberMe: prefs.rememberMe, phase: "initializing" }));
			return refreshSession();
		})();
	}

	return initializePromise;
}

export async function setRememberMe(rememberMe: boolean): Promise<AuthSnapshot> {
	persistPreferences({ rememberMe });
	return setSnapshot((current) => ({ ...current, rememberMe }));
}

type EmailAuthInput = {
	email: string;
	password: string;
	rememberMe: boolean;
	name?: string;
};

function getPostOAuthPath(): string {
	if (typeof window === "undefined") return "/app";
	const next = `${window.location.pathname}${window.location.search}`;
	if (next === "/" || next.startsWith("/sign-in") || next.startsWith("/sign-up")) {
		return "/app";
	}
	return next;
}

export function getOAuthRedirectTo(): string | undefined {
	if (typeof window === "undefined") return undefined;
	return new URL(getPostOAuthPath(), window.location.origin).toString();
}

export async function signInWithPassword(input: EmailAuthInput): Promise<AuthSnapshot> {
	await setRememberMe(input.rememberMe);
	clearError();

	const { data, error } = await authClient.signIn.email({
		email: input.email,
		password: input.password,
		rememberMe: input.rememberMe,
	});

	if (error) {
		setError(new Error(error.message ?? "Sign-in failed"));
		throw new Error(error.message ?? "Sign-in failed");
	}

	return applySession(data?.user ?? null);
}

export async function signUpWithPassword(input: EmailAuthInput): Promise<AuthSnapshot> {
	await setRememberMe(input.rememberMe);
	clearError();

	const fallbackName = input.name?.trim() || input.email.split("@")[0] || "Skriuw user";

	const { data, error } = await authClient.signUp.email({
		email: input.email,
		password: input.password,
		name: fallbackName,
	});

	if (error) {
		setError(new Error(error.message ?? "Sign-up failed"));
		throw new Error(error.message ?? "Sign-up failed");
	}

	if (!data?.user) {
		throw new Error("Account created but no session returned.");
	}

	return applySession(data.user);
}

export async function signInWithOAuth(
	provider: OAuthProvider,
	options: { rememberMe: boolean },
): Promise<void> {
	await setRememberMe(options.rememberMe);
	clearError();

	const { error } = await authClient.signIn.social({
		provider,
		callbackURL: getOAuthRedirectTo(),
	});

	if (error) {
		setError(new Error(error.message ?? "OAuth sign-in failed"));
		throw new Error(error.message ?? "OAuth sign-in failed");
	}
}

export async function signOut(): Promise<AuthSnapshot> {
	clearError();
	try {
		await authClient.signOut();
	} catch (error) {
		setError(error);
	}
	return applySession(null);
}

export async function updateUserDisplayName(name: string): Promise<void> {
	clearError();
	const { error } = await authClient.updateUser({ name });
	if (error) {
		setError(new Error(error.message ?? "Could not update name"));
		throw new Error(error.message ?? "Could not update name");
	}
	await refreshSession();
}

export async function updatePassword(input: {
	currentPassword: string;
	newPassword: string;
}): Promise<void> {
	clearError();
	const { error } = await authClient.changePassword({
		currentPassword: input.currentPassword,
		newPassword: input.newPassword,
	});
	if (error) {
		setError(new Error(error.message ?? "Could not update password"));
		throw new Error(error.message ?? "Could not update password");
	}
}

export function getWorkspaceId(): string {
	return getDerivedWorkspaceId(snapshot.user);
}

export function resolveWorkspaceId(workspaceId?: string | null): string {
	return workspaceId ?? getWorkspaceId();
}

export function getUserScopeId(): string {
	return getWorkspaceId();
}

export function resolveUserScopeId(userScopeId?: string | null): string {
	return userScopeId ?? getUserScopeId();
}

export function resetAuthForTests(): void {
	initializePromise = null;
	listeners.clear();
	snapshot = normalizeSnapshot({
		phase: "initializing",
		rememberMe: true,
		isReady: false,
		isAuthConfigured: true,
		user: null,
		session: null,
		error: null,
		workspaceId: SIGNED_OUT_WORKSPACE_ID,
	});
}
