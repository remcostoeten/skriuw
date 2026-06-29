"use client";

import { authClient } from "@/lib/auth-client";
import { getOAuthRedirectTo, type OAuthProvider } from "@/core/auth";

export type ProviderMeta = {
	id: OAuthProvider;
	label: string;
};

/** OAuth providers offered in the Connected accounts UI, in display order. */
export const SUPPORTED_OAUTH_PROVIDERS: ReadonlyArray<ProviderMeta> = [
	{ id: "github", label: "GitHub" },
	{ id: "google", label: "Google" },
];

export type ConnectedAccount = {
	accountId: string;
	providerId: string;
	createdAt: string | null;
};

export type ConnectionsSnapshot = {
	credential: boolean;
	accounts: ConnectedAccount[];
	loginMethodCount: number;
};

export type EmailProviderInfo = {
	exists: boolean;
	hasPassword: boolean;
	providers: string[];
};

export const DUPLICATE_OAUTH_EMAIL_EVENT = "skriuw:duplicate-oauth-email";

export type DuplicateOAuthEmailDetail = {
	email: string;
	provider: string;
};

/** Returns the provider label for a known id, falling back to the raw id. */
export function getProviderLabel(providerId: string): string {
	const known = SUPPORTED_OAUTH_PROVIDERS.find((provider) => provider.id === providerId);
	return known?.label ?? providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

/** Loads the signed-in user's linked accounts and password-login status. */
export async function listConnections(): Promise<ConnectionsSnapshot> {
	const res = await fetch("/api/account/connections", {
		method: "GET",
		headers: { Accept: "application/json" },
	});
	const payload = (await res.json().catch(() => null)) as
		| (ConnectionsSnapshot & { error?: string })
		| null;
	if (!res.ok || !payload) {
		throw new Error(payload?.error ?? "Could not load connected accounts.");
	}
	return {
		credential: payload.credential,
		accounts: payload.accounts ?? [],
		loginMethodCount: payload.loginMethodCount,
	};
}

/** Starts the OAuth flow that links a provider to the current account. */
export async function linkProvider(provider: OAuthProvider): Promise<void> {
	const { error } = await authClient.linkSocial({
		provider,
		callbackURL: getOAuthRedirectTo(),
	});
	if (error) {
		throw new Error(error.message ?? "Could not start account linking.");
	}
}

/** Unlinks a provider, guarded server-side against removing the last login method. */
export async function unlinkProvider(input: {
	providerId: string;
	accountId?: string;
}): Promise<void> {
	const res = await fetch("/api/account/connections", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
	const payload = (await res.json().catch(() => null)) as { error?: string } | null;
	if (!res.ok) {
		throw new Error(payload?.error ?? "Could not disconnect this account.");
	}
}

/** Looks up whether an email already exists and through which providers. */
export async function checkEmailProvider(email: string): Promise<EmailProviderInfo> {
	const res = await fetch("/api/auth/email-provider", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email }),
	});
	const payload = (await res.json().catch(() => null)) as
		| (EmailProviderInfo & { error?: string })
		| null;
	if (!res.ok || !payload) {
		throw new Error(payload?.error ?? "Could not verify email.");
	}
	return {
		exists: payload.exists,
		hasPassword: payload.hasPassword,
		providers: payload.providers ?? [],
	};
}
