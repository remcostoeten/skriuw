import { routePartykitRequest } from "partyserver";
import { YServer } from "y-partyserver";
import { verifyCollabToken } from "../src/features/collaboration/lib/collab-token";

// One Durable Object per note. The room name IS the note id, so authorization
// is "does this token grant access to THIS note" — verified against the same
// HMAC secret the Next.js room-auth route signs with.
//
// Runs on YOUR Cloudflare account (deploy with `bunx wrangler deploy`), not the
// shared partykit.dev zone — so the 10k-custom-domain limit never applies.
//
// Set the secret with: `bunx wrangler secret put COLLAB_AUTH_SECRET`
// (must match the app's COLLAB_AUTH_SECRET).
export class NotesServer extends YServer {
	// The Yjs document is held in this Durable Object's SQLite storage and
	// survives hibernation, so a note's content persists between editing
	// sessions with no external database — the equivalent of the old
	// y-partykit "snapshot" persistence mode.
}

type Env = {
	Notes: DurableObjectNamespace;
	COLLAB_AUTH_SECRET?: string;
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const routed = await routePartykitRequest(request, env, {
			// Runs on the edge before the socket reaches the room. Reject
			// unauthorized connections here so a bad token never opens a Yjs
			// session. Identity itself is not forwarded into the room — it travels
			// in Yjs awareness from the client — so on success we pass the request
			// through untouched.
			async onBeforeConnect(req, { name }) {
				try {
					const token = new URL(req.url).searchParams.get("token");
					const secret = env.COLLAB_AUTH_SECRET;
					if (!token || !secret) {
						return new Response("Unauthorized", { status: 401 });
					}

					const payload = await verifyCollabToken(token, secret);
					if (!payload) return new Response("Unauthorized", { status: 401 });

					// The token is scoped to a single note; it must match the room.
					if (payload.noteId !== name) {
						return new Response("Forbidden", { status: 403 });
					}
				} catch {
					return new Response("Unauthorized", { status: 401 });
				}
			},
		});

		return routed ?? new Response("Not Found", { status: 404 });
	},
};
