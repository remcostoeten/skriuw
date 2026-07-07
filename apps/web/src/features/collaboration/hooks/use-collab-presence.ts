"use client";

import { useMemo } from "react";
import type { Awareness } from "y-protocols/awareness";
import type { TCollabPresenceState, TCollabRole } from "../lib/collab-activity";

/** Below this idle gap (ms) a peer counts as "active" rather than "idle". */
const ACTIVE_WINDOW_MS = 30_000;
export type TCollabStatusKind = "typing" | "active" | "idle";

export type TCollabPeer = {
	/** Yjs awareness client id — stable for the lifetime of a connection. */
	clientId: number;
	name: string;
	color: string;
	/** True for the local user's own entry. */
	isSelf: boolean;
	role: TCollabRole | null;
	/** Live activity classification, derived from the peer's `lastActive`. */
	status: TCollabStatusKind;
	/** Wall-clock ms of the peer's last edit/activity, or null if unknown. */
	lastActive: number | null;
};

function classify(
	presence: TCollabPresenceState | undefined,
	now: number,
): {
	status: TCollabStatusKind;
	lastActive: number | null;
} {
	if (!presence) return { status: "active", lastActive: null };
	if (presence.typing) return { status: "typing", lastActive: presence.lastActive ?? null };
	const lastActive = presence.lastActive ?? null;
	if (lastActive != null && now - lastActive <= ACTIVE_WINDOW_MS) {
		return { status: "active", lastActive };
	}
	return { status: "idle", lastActive };
}

function readPeers(awareness: Awareness, now: number): TCollabPeer[] {
	const selfId = awareness.clientID;
	const peers: TCollabPeer[] = [];
	for (const [clientId, state] of awareness.getStates()) {
		const user = (state as { user?: { name?: string; color?: string } }).user;
		if (!user?.name) continue;
		const presence = (state as { presence?: TCollabPresenceState }).presence;
		const { status, lastActive } = classify(presence, now);
		peers.push({
			clientId,
			name: user.name,
			color: user.color ?? "#888888",
			isSelf: clientId === selfId,
			role: presence?.role ?? null,
			status,
			lastActive,
		});
	}
	// Stable order so the avatar stack doesn't reshuffle on every awareness tick.
	return peers.sort((a, b) => a.clientId - b.clientId);
}

/**
 * Live list of users currently connected to the collaboration room, derived
 * from Yjs awareness. Returns an empty array when there's no awareness (note
 * isn't collaborative). Two browser tabs of the same account show up as two
 * distinct peers — they have different awareness client ids.
 *
 * Re-derives both on every awareness `change` event and on a slow interval, so
 * a peer that goes quiet transitions active → idle without needing a new event.
 */
export function useCollabPresence(awareness: Awareness | null | undefined): TCollabPeer[] {
	return useMemo(() => (awareness ? readPeers(awareness, Date.now()) : []), [awareness]);
}
