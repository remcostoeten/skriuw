import type { Awareness } from "y-protocols/awareness";

export type TCollabRole = "owner" | "editor" | "viewer";

/**
 * Live per-user state broadcast over Yjs awareness on the `presence` field
 * (kept separate from BlockNote's own `user` field). `lastActive` is a wall
 * clock ms timestamp from the peer that wrote it; only used for relative
 * "active / idle" derivation, never for ordering correctness.
 */
export type TCollabPresenceState = {
	role: TCollabRole;
	lastActive: number;
	typing: boolean;
};

/**
 * Stamp the local user as active (and optionally typing) on the shared
 * awareness so other peers can reflect what this person is doing right now.
 * No-ops until the room has seeded the `presence` field, so it never races the
 * initial connect.
 */
export function markCollabActivity(awareness: Awareness | null | undefined, typing: boolean): void {
	if (!awareness) return;
	const current = awareness.getLocalState()?.presence as TCollabPresenceState | undefined;
	if (!current) return;
	awareness.setLocalStateField("presence", {
		...current,
		lastActive: Date.now(),
		typing,
	});
}
