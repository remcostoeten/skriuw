"use client";

import { authClient } from "@/lib/auth-client";
import { resetGuestStorage } from "@/core/workspace-backend/local-backend";

export type AuthUser = {
	id: string;
	email: string;
	name: string;
	role: string | null;
};

export type AuthPhase = "initializing" | "signed_out" | "authenticated";
export type OAuthProvider = "github";

export type AuthSnapshot = {
	phase: AuthPhase;
	rememberMe: boolean;
	isReady: boolean;
	user: AuthUser | null;
	error: string | null;
};

type BetterAuthUser = {
	id: string;
	email: string;
	name?: string | null;
	role?: string | null;
};

type AuthPreferences = {
	rememberMe: boolean;
};

const AUTH_PREFERENCES_KEY = "skriuw:auth:preferences:v1";
export const SIGNED_OUT_USER_SCOPE = "signed-out-local";

let currentUser: AuthUser | null = null;

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

export function toAuthUser(rawUser: BetterAuthUser | null | undefined): AuthUser | null {
	if (!rawUser) return null;
	return {
		id: rawUser.id,
		email: rawUser.email ?? "",
		name: rawUser.name?.trim() || rawUser.email?.split("@")[0] || "Signed-in user",
		role: rawUser.role ?? null,
	};
}

export function getUserScopeIdForUser(user: AuthUser | null): string {
	return user?.id ?? SIGNED_OUT_USER_SCOPE;
}

export function setCurrentAuthUser(user: AuthUser | null): void {
	currentUser = user;
}

export function createAuthSnapshot(input: {
	user: AuthUser | null;
	isPending?: boolean;
	error?: unknown;
	rememberMe?: boolean;
}): AuthSnapshot {
	const user = input.user;
	const phase: AuthPhase = input.isPending
		? "initializing"
		: user
			? "authenticated"
			: "signed_out";
	const error =
		input.error instanceof Error
			? input.error.message
			: typeof input.error === "string"
				? input.error
				: null;

	return {
		phase,
		rememberMe: input.rememberMe ?? readPreferences().rememberMe,
		isReady: phase !== "initializing",
		user,
		error,
	};
}

export function getRememberMePreference(): boolean {
	return readPreferences().rememberMe;
}

export async function setRememberMe(rememberMe: boolean): Promise<AuthSnapshot> {
	persistPreferences({ rememberMe });
	return createAuthSnapshot({ user: currentUser, rememberMe });
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

	const { data, error } = await authClient.signIn.email({
		email: input.email,
		password: input.password,
		rememberMe: input.rememberMe,
	});

	if (error) {
		throw new Error(error.message ?? "Sign-in failed");
	}

	const user = toAuthUser(data?.user);
	setCurrentAuthUser(user);
	return createAuthSnapshot({ user });
}

export async function signUpWithPassword(input: EmailAuthInput): Promise<AuthSnapshot> {
	await setRememberMe(input.rememberMe);

	const fallbackName = input.name?.trim() || input.email.split("@")[0] || "Skriuw user";

	const { data, error } = await authClient.signUp.email({
		email: input.email,
		password: input.password,
		name: fallbackName,
	});

	if (error) {
		throw new Error(error.message ?? "Sign-up failed");
	}

	if (!data?.user) {
		throw new Error("Account created but no session returned.");
	}

	// New account starts from the normal seed — discard any local guest
	// workspace + engagement counter so it doesn't linger invisibly.
	resetGuestStorage();

	const user = toAuthUser(data.user);
	setCurrentAuthUser(user);
	return createAuthSnapshot({ user });
}

export async function signInWithOAuth(
	provider: OAuthProvider,
	options: { rememberMe: boolean },
): Promise<void> {
	await setRememberMe(options.rememberMe);

	// Once authenticated, any local guest workspace is irrelevant — clear it
	// before the OAuth redirect so it doesn't linger.
	resetGuestStorage();

	const { error } = await authClient.signIn.social({
		provider,
		callbackURL: getOAuthRedirectTo(),
	});

	if (error) {
		throw new Error(error.message ?? "OAuth sign-in failed");
	}
}

export async function signOut(): Promise<AuthSnapshot> {
	const { error } = await authClient.signOut();
	if (error) {
		throw new Error(error.message ?? "Sign-out failed");
	}
	setCurrentAuthUser(null);
	return createAuthSnapshot({ user: null });
}

export async function updateUserDisplayName(name: string): Promise<void> {
	const { error } = await authClient.updateUser({ name });
	if (error) {
		throw new Error(error.message ?? "Could not update name");
	}
}

export async function updatePassword(input: {
	currentPassword: string;
	newPassword: string;
}): Promise<void> {
	const { error } = await authClient.changePassword({
		currentPassword: input.currentPassword,
		newPassword: input.newPassword,
	});
	if (error) {
		throw new Error(error.message ?? "Could not update password");
	}
}

export function getUserScopeId(): string {
	return getUserScopeIdForUser(currentUser);
}

export function resolveUserScopeId(userScopeId?: string | null): string {
	return userScopeId ?? getUserScopeId();
}

export function resetAuthForTests(): void {
	currentUser = null;
	if (typeof window !== "undefined") {
		window.localStorage.removeItem(AUTH_PREFERENCES_KEY);
	}
}
