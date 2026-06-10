"use client";

import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";
import { authClient } from "@/lib/auth-client";

function getAppCallbackURL(): string {
	if (typeof window === "undefined") {
		return "/app";
	}

	return new URL("/app", window.location.origin).toString();
}

export const authDrawerAdapter = createBetterAuthAdapter({
	client: authClient,
	callbackURL: getAppCallbackURL(),
	newUserCallbackURL: getAppCallbackURL(),
});
