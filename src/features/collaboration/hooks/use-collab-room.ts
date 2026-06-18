"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import YPartyKitProvider from "y-partykit/provider";
import type { Awareness } from "y-protocols/awareness";

// Both clients must read/write the same named fragment for edits to converge.
// We choose the name (it's passed straight to BlockNote's `collaboration`
// option), so a single shared constant is all that's required.
export const COLLAB_FRAGMENT = "blocknote";

export type TCollabStatus =
	| "disabled" // not a shared note, or PartyKit not configured
	| "connecting" // fetching token / opening socket
	| "connected" // socket open and synced
	| "disconnected" // socket dropped; edits queue locally and replay on reconnect
	| "forbidden" // no access to this note (403)
	| "error"; // auth/transport failure

export type TCollabRoom = {
	status: TCollabStatus;
	/** True once the initial document state has synced from the room. */
	synced: boolean;
	doc: Y.Doc | null;
	fragment: Y.XmlFragment | null;
	provider: YPartyKitProvider | null;
	awareness: Awareness | null;
	role: "owner" | "editor" | "viewer" | null;
	user: { name: string; color: string } | null;
};

type TAuthResponse = {
	token: string;
	host: string;
	role: "owner" | "editor" | "viewer";
	user: { name: string; color: string };
};

const DISABLED: TCollabRoom = {
	status: "disabled",
	synced: false,
	doc: null,
	fragment: null,
	provider: null,
	awareness: null,
	role: null,
	user: null,
};

/**
 * Establishes (or tears down) a Yjs collaboration room for a note backed by
 * PartyKit. Returns `disabled` immediately when `enabled` is false, so callers
 * can keep this hook above any conditional and only switch to the collaborative
 * editor once `status === "connected"`.
 */
export function useCollabRoom(noteId: string | null, enabled: boolean): TCollabRoom {
	const [room, setRoom] = useState<TCollabRoom>(DISABLED);

	useEffect(() => {
		if (!enabled || !noteId) {
			setRoom(DISABLED);
			return;
		}

		let cancelled = false;
		let doc: Y.Doc | null = null;
		let provider: YPartyKitProvider | null = null;

		setRoom({ ...DISABLED, status: "connecting" });

		(async () => {
			let auth: TAuthResponse;
			try {
				const res = await fetch("/api/collaboration/auth", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ noteId }),
				});
				if (res.status === 403) {
					if (!cancelled) setRoom({ ...DISABLED, status: "forbidden" });
					return;
				}
				if (!res.ok) {
					if (!cancelled) setRoom({ ...DISABLED, status: "error" });
					return;
				}
				auth = (await res.json()) as TAuthResponse;
			} catch {
				if (!cancelled) setRoom({ ...DISABLED, status: "error" });
				return;
			}

			if (cancelled) return;

			doc = new Y.Doc();
			const fragment = doc.getXmlFragment(COLLAB_FRAGMENT);
			provider = new YPartyKitProvider(auth.host, noteId, doc, {
				params: { token: auth.token },
				connect: true,
			});
			provider.awareness.setLocalStateField("user", auth.user);

			const base: TCollabRoom = {
				status: "connecting",
				synced: false,
				doc,
				fragment,
				provider,
				awareness: provider.awareness,
				role: auth.role,
				user: auth.user,
			};
			setRoom(base);

			provider.on("status", ({ status }: { status: string }) => {
				if (cancelled) return;
				setRoom((prev) => ({
					...prev,
					status: status === "connected" ? "connected" : "disconnected",
				}));
			});
			provider.on("sync", (isSynced: boolean) => {
				if (cancelled || !isSynced) return;
				setRoom((prev) => ({ ...prev, synced: true, status: "connected" }));
			});
		})();

		return () => {
			cancelled = true;
			provider?.destroy();
			doc?.destroy();
		};
	}, [noteId, enabled]);

	return room;
}
