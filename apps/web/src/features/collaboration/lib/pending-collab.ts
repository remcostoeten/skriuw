// A collaboration request started from a public share page survives the auth
// redirect (OAuth does a full-page navigation to /app) by stashing the target
// noteId here. Once the user lands back authenticated, the app replays the
// request. localStorage (not a query param) so it survives the OAuth round trip.
import { noop } from "@/shared/lib/noop";

const PENDING_COLLAB_KEY = "skriuw:pending-collab";

export function setPendingCollabRequest(noteId: string): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(PENDING_COLLAB_KEY, noteId);
	} catch {
		// Ignore storage failures (private mode quota, disabled storage).
		noop();
	}
}

/** Read and clear the pending request in one step so it can't replay twice. */
export function takePendingCollabRequest(): string | null {
	if (typeof window === "undefined") return null;
	try {
		const noteId = window.localStorage.getItem(PENDING_COLLAB_KEY);
		if (noteId) window.localStorage.removeItem(PENDING_COLLAB_KEY);
		return noteId;
	} catch {
		return null;
	}
}
