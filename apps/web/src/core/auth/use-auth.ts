"use client";

import { useEffect, useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import { createAuthSnapshot, setCurrentAuthUser, toAuthUser } from "@/core/auth";

/**
 * Client auth state for React components.
 *
 * Returns an {@link AuthSnapshot} with `phase`, `user`, and `isReady`. Also
 * syncs the current user into module-level auth helpers so non-React code
 * (e.g. persisted stores) can read the signed-in user via `getUserScopeId()`.
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
export function useAuth() {
	const session = authClient.useSession();
	const user = useMemo(() => toAuthUser(session.data?.user), [session.data?.user]);

	useEffect(() => {
		if (!session.isPending) {
			setCurrentAuthUser(user);
		}
	}, [session.isPending, user]);

	return useMemo(
		() =>
			createAuthSnapshot({
				user,
				isPending: session.isPending,
				error: session.error,
			}),
		[user, session.error, session.isPending],
	);
}
