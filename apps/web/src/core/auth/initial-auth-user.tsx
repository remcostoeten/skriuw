"use client";

import { createContext, useContext } from "react";
import type { AuthUser } from "./auth-user";

/**
 * Server-known user threaded into the client tree so the first render can
 * treat auth as resolved instead of waiting for the client-side
 * `/api/auth/get-session` round trip. `null` means the server rendered
 * signed-out (or the route has no server auth), which falls back to the
 * normal pending flow.
 */
const InitialAuthUserContext = createContext<AuthUser | null>(null);

export const InitialAuthUserProvider = InitialAuthUserContext.Provider;

export function useInitialAuthUser(): AuthUser | null {
	return useContext(InitialAuthUserContext);
}
