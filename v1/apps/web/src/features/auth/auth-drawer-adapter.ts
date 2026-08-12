"use client";

import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";
import type { AuthAdapter } from "@remcostoeten/auth-drawer";
import { authClient } from "@/lib/auth-client";
import { getBrowserAppOrigin } from "@/lib/app-origin";
import {
	checkEmailProvider,
	getProviderLabel,
	DUPLICATE_OAUTH_EMAIL_EVENT,
	type DuplicateOAuthEmailDetail,
} from "@/core/auth/connections";

function getAppCallbackURL(): string {
	const origin = getBrowserAppOrigin();
	if (!origin) return "/app";

	return new URL("/app", origin).toString();
}

const baseAdapter: AuthAdapter = createBetterAuthAdapter({
	client: authClient,
	callbackURL: getAppCallbackURL(),
	newUserCallbackURL: getAppCallbackURL(),
	providers: ["github", "google"],
});

function emitDuplicateOAuthEmail(detail: DuplicateOAuthEmailDetail): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(DUPLICATE_OAUTH_EMAIL_EVENT, { detail }));
}

/**
 * Wraps the Better Auth adapter so a registration against an OAuth-only email
 * is blocked before it hits the server, steering the user to the provider they
 * already use instead of returning a generic "user exists" error.
 */
export const authDrawerAdapter: AuthAdapter = {
	...baseAdapter,
	signUp: baseAdapter.signUp
		? async (input) => {
				const info = await checkEmailProvider(input.email).catch(() => null);
				if (info?.exists && !info.hasPassword && info.providers.length > 0) {
					const provider = info.providers[0];
					emitDuplicateOAuthEmail({ email: input.email, provider });
					throw new Error(
						`An account with this email already exists via ${getProviderLabel(provider)}. Sign in with ${getProviderLabel(provider)} instead.`,
					);
				}
				return baseAdapter.signUp!(input);
			}
		: undefined,
};
