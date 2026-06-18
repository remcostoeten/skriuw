"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/core/auth/use-auth";
import { requestCollaboration } from "@/domain/collaboration/actions";
import { takePendingCollabRequest } from "@/features/collaboration/lib/pending-collab";
import { showUserToast } from "@/shared/lib/user-toast";

/**
 * Replays a collaboration request that was started from a public share page
 * before the user signed in. The intent is stashed in localStorage by
 * {@link CollabRequestButton}; once auth is ready and the session is
 * authenticated, we send the request, surface the outcome, and refresh the
 * "Shared with me" list. Mounted once, app-wide, so it fires no matter which
 * route the auth flow lands on (OAuth redirects to /app).
 */
export function PendingCollabReplay() {
	const auth = useAuth();
	const handled = useRef(false);
	const queryClient = useQueryClient();

	useEffect(() => {
		if (handled.current) return;
		if (!auth.isReady || auth.phase !== "authenticated") return;

		const noteId = takePendingCollabRequest();
		if (!noteId) return;
		handled.current = true;

		void (async () => {
			try {
				const result = await requestCollaboration(noteId);
				if (result.ok) {
					showUserToast("Collaboration request sent", "success");
				} else if (
					result.error === "Request already pending" ||
					result.error === "Already a collaborator"
				) {
					showUserToast(result.error, "info");
				} else if (result.error && result.error !== "You own this note") {
					showUserToast(result.error, "error");
				}
				queryClient.invalidateQueries({ queryKey: ["shared-notes"] });
			} catch {
				showUserToast("Couldn't send collaboration request", "error");
			}
		})();
	}, [auth.isReady, auth.phase, queryClient]);

	return null;
}
