// ---------------------------------------------------------------------------
// Better Auth Expo client.
//
// Native apps have no cookie jar, so the @better-auth/expo plugin stores the
// session cookie in expo-secure-store and attaches it to every request. The
// SERVER must add the matching `expo()` plugin and register `skriuw://` in
// trustedOrigins (Phase 0 server change) for this to work.
//
// Phase 0 spike: version compatibility between @better-auth/expo and the
// server's better-auth version is the #1 risk. If the spike fails, fall back
// to the SyncToken bearer scheme.
// ---------------------------------------------------------------------------

import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { getApiBaseUrl } from "@/lib/config";
import { noop } from "@/shared/noop";

// expo-better-auth-passkey calls requireNativeModule() at import time, which
// throws inside Expo Go (the native module only exists in dev/production
// builds). Loading it lazily lets the rest of auth work there.
function loadPasskeyPlugins() {
	try {
		const { expoPasskeyClient } =
			require("expo-better-auth-passkey") as typeof import("expo-better-auth-passkey");
		return [expoPasskeyClient()];
	} catch {
		noop();
		return [];
	}
}

export const authClient = createAuthClient({
	baseURL: getApiBaseUrl(),
	plugins: [
		expoClient({
			scheme: "skriuw",
			storagePrefix: "skriuw",
			storage: SecureStore,
		}),
		...loadPasskeyPlugins(),
	],
});

export const { useSession, signIn, signUp, signOut } = authClient;

/** The cookie header the http backend must attach to /api/workspace/* calls.
 *  The expo plugin persists this in SecureStore. */
export function getSessionCookie(): string {
	return authClient.getCookie();
}
