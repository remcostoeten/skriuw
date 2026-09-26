"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { createAuthSnapshot, setCurrentAuthUser, toAuthUser } from "@/core/auth";
import { useInitialAuthUser } from "./initial-auth-user";

function isTauriRuntime(): boolean {
	if (typeof window === "undefined") return false;
	return Boolean(
		(window as { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__?.core?.invoke,
	);
}

// Desktop is local-first with no auth server: `authClient.useSession()` would
// fire a network request to the cloud origin on every launch (and hang offline
// until timeout) for a session that can never exist. The desktop variant never
// touches the auth client — it returns the same resolved signed-out snapshot
// the web variant would eventually settle on.
function useDesktopAuth() {
	useEffect(() => {
		setCurrentAuthUser(null);
	}, []);

	return useMemo(() => createAuthSnapshot({ user: null, isPending: false }), []);
}

function subscribeToNothing(): () => void {
	return () => {};
}

// `false` on the server and for the hydration render, `true` immediately after
// (React re-renders synchronously when the client snapshot differs). Gating the
// seeded snapshot on this keeps the hydration render identical to the
// prerendered shell — flipping phase DURING hydration left the page segment's
// dehydrated Suspense boundary suspended forever (verified via fiber
// inspection: LoadingBoundary stuck with `dehydrated` state).
function useHydrated(): boolean {
	return useSyncExternalStore(
		subscribeToNothing,
		() => true,
		() => false,
	);
}

function useWebAuth() {
	const initialUser = useInitialAuthUser();
	const session = authClient.useSession();
	const hydrated = useHydrated();
	const sessionUser = useMemo(() => toAuthUser(session.data?.user), [session.data?.user]);

	// Better Auth's `useSession` reports `isPending: false` during SSR (and can
	// on the first client emissions) WITHOUT having fetched anything. Treating
	// that as resolved caused a FileList hydration mismatch (server rendered
	// signed-out) and an infinite server-action refetch loop (phase flapped
	// authenticated -> signed_out -> authenticated, remounting the workspace
	// backend each time). So while a server-known user is seeded, a null
	// session verdict only counts once a real client fetch was observed
	// in-flight; a non-null verdict is accepted immediately.
	const sawPendingRef = useRef(false);
	if (hydrated && session.isPending) {
		sawPendingRef.current = true;
	}
	const clientResolved =
		hydrated && !session.isPending && (session.data !== null || sawPendingRef.current);
	const seeding = hydrated && initialUser !== null && !clientResolved;

	const user = seeding ? initialUser : sessionUser;
	const isPending = seeding ? false : session.isPending;

	useEffect(() => {
		if (!isPending) {
			setCurrentAuthUser(user);
		}
	}, [isPending, user]);

	return useMemo(
		() =>
			createAuthSnapshot({
				user,
				isPending,
				error: session.error,
			}),
		[user, session.error, isPending],
	);
}

/**
 * Client auth state for React components.
 *
 * Returns an {@link AuthSnapshot} with `phase`, `user`, and `isReady`. Also
 * syncs the current user into module-level auth helpers so non-React code
 * (e.g. persisted stores) can read the signed-in user via `getUserScopeId()`.
 *
 * The implementation is chosen once at module load: the Tauri runtime flag
 * cannot change within a session, so the hook identity is stable and the
 * rules-of-hooks hold.
 *
 * @example Gate UI on auth phase
 * ```ts
 * const auth = useAuth();
 *
 * if (!auth.isReady) return <AuthSkeleton />;
 * if (auth.phase === "signed_out") return <SignInPrompt />;
 *
 * return <NotesApp user={auth.user} />;
 * ```
 *
 * @example Combine with {@link useAuthedApiQuery} (handled inside that hook)
 * ```ts
 * // useAuthedApiQuery already waits for auth.isReady && phase === "authenticated"
 * const { data: notes } = useNotes();
 * ```
 */
export const useAuth = isTauriRuntime() ? useDesktopAuth : useWebAuth;
