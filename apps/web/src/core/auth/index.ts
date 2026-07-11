"use client";

import { authClient } from "@/lib/auth-client";
import { getBrowserAppOrigin } from "@/lib/app-origin";
import { resetPostHogPerson } from "@/core/analytics/posthog";
import { resetGuestStorage } from "@/core/workspace-backend/local-backend";
import { noop } from "@/shared/lib/noop";

import { toAuthUser } from "./auth-user";
import type { AuthUser, BetterAuthUser } from "./auth-user";

export { toAuthUser };
export type { AuthUser, BetterAuthUser };

export type AuthPhase = "initializing" | "signed_out" | "authenticated";
export type OAuthProvider = "github" | "google";

export type AuthSnapshot = {
	phase: AuthPhase;
	rememberMe: boolean;
	isReady: boolean;
	user: AuthUser | null;
	error: string | null;
};

type AuthPreferences = {
	rememberMe: boolean;
};

const PREFERENCES_STORAGE_KEY = "skriuw:auth:preferences:v1";
export const SIGNED_OUT_USER_SCOPE = "signed-out-local";

let currentUser: AuthUser | null = null;

function readPreferences(): AuthPreferences {
	if (typeof window === "undefined") {
		return { rememberMe: true };
	}

	try {
		const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
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
	try {
		window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
	} catch {
		noop();
	}
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

async function setRememberMe(rememberMe: boolean): Promise<AuthSnapshot> {
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

// react-doctor-disable-next-line unused-export -- used across auth flows and tests; keep the public helper.
export function getOAuthRedirectTo(): string | undefined {
	const origin = getBrowserAppOrigin();
	if (!origin) return undefined;

	return new URL(getPostOAuthPath(), origin).toString();
}

// react-doctor-disable-next-line unused-export, deslop/unused-export -- public auth entrypoint.
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

// react-doctor-disable-next-line unused-export, deslop/unused-export -- public auth entrypoint.
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
	await resetGuestStorage();

	const user = toAuthUser(data.user);
	setCurrentAuthUser(user);
	return createAuthSnapshot({ user });
}

// react-doctor-disable-next-line unused-export -- public auth entrypoint.
export async function signInWithOAuth(
	provider: OAuthProvider,
	options: { rememberMe: boolean },
): Promise<void> {
	// Once authenticated, any local guest workspace is irrelevant — clear it
	// before the OAuth redirect so it doesn't linger.
	await Promise.all([setRememberMe(options.rememberMe), resetGuestStorage()]);

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
	resetPostHogPerson();
	return createAuthSnapshot({ user: null });
}

export async function updateUserDisplayName(name: string): Promise<void> {
	const { error } = await authClient.updateUser({ name });
	if (error) {
		throw new Error(error.message ?? "Could not update name");
	}
}

const USERNAME_TAKEN_ERROR_CODE = "USERNAME_IS_ALREADY_TAKEN";

export async function updateUsername(username: string): Promise<void> {
	const { error } = await authClient.updateUser({ username });
	if (error) {
		const failure = new Error(error.message ?? "Could not update username") as Error & {
			code?: string;
		};
		if (error.code) failure.code = error.code;
		throw failure;
	}
}

/**
 * Whether `error` is the Better Auth username-uniqueness conflict thrown by
 * {@link updateUsername} (server code `USERNAME_IS_ALREADY_TAKEN`). Use this to
 * distinguish a genuine "already taken" conflict from generic/network failures.
 */
export function isUsernameTakenError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === USERNAME_TAKEN_ERROR_CODE
	);
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

// react-doctor-disable-next-line unused-export -- used by workspace stores and tests.
export function resolveUserScopeId(userScopeId?: string | null): string {
	return userScopeId ?? getUserScopeId();
}

// react-doctor-disable-next-line unused-export, deslop/unused-export -- test-only helper.
export function resetAuthForTests(): void {
	currentUser = null;
	if (typeof window !== "undefined") {
		window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
	}
}
