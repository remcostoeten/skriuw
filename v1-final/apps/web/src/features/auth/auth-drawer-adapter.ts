"use client";

import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";
import type { AuthAdapter } from "@remcostoeten/auth-drawer";
import { authClient } from "@/lib/auth-client";
import { getBrowserAppOrigin } from "@/lib/app-origin";

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

export const authDrawerAdapter: AuthAdapter = baseAdapter;
