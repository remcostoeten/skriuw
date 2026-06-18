import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";
import { verifyCollabToken } from "../src/features/collaboration/lib/collab-token";

// One PartyKit room per note. The room id IS the note id, so authorization is
// "does this token grant access to THIS note" — verified against the same
// HMAC secret the Next.js room-auth route signs with.
//
// Set the secret with: `npx partykit env add COLLAB_AUTH_SECRET`
// (must match the app's COLLAB_AUTH_SECRET).
export default class NotesServer implements Party.Server {
	constructor(readonly room: Party.Room) {}

	// Runs on the edge before the socket reaches the room. Reject unauthorized
	// connections here so a bad token never opens a Yjs session.
	static async onBeforeConnect(request: Party.Request, lobby: Party.Lobby) {
		try {
			const token = new URL(request.url).searchParams.get("token");
			const secret = lobby.env.COLLAB_AUTH_SECRET as string | undefined;
			if (!token || !secret) return new Response("Unauthorized", { status: 401 });

			const payload = await verifyCollabToken(token, secret);
			if (!payload) return new Response("Unauthorized", { status: 401 });

			// The token is scoped to a single note; it must match the room.
			if (payload.noteId !== lobby.id) {
				return new Response("Forbidden", { status: 403 });
			}

			// Forward the verified identity to the room instance.
			request.headers.set("x-user-id", payload.userId);
			request.headers.set("x-user-role", payload.role);
			return request;
		} catch {
			return new Response("Unauthorized", { status: 401 });
		}
	}

	onConnect(conn: Party.Connection) {
		// Snapshot persistence: the full doc is kept in room storage while anyone
		// is connected and compacted to a snapshot when the last client leaves, so
		// a note's content survives between editing sessions.
		return onConnect(conn, this.room, { persist: { mode: "snapshot" } });
	}
}

NotesServer satisfies Party.Worker;
