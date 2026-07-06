/// <reference types="@cloudflare/workers-types" />
import { routePartykitRequest } from "partyserver";
import { YServer } from "y-partyserver";
import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";
import { verifyCollabToken } from "../apps/web/src/features/collaboration/lib/collab-token";

const DOC_STORAGE_KEY = "ydoc";

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
	// y-partyserver does NOT persist the document on its own — its default
	// `onLoad`/`onSave` are empty no-ops, so the Yjs doc would live only in this
	// Durable Object's memory and reset to empty on every hibernation/eviction
	// (e.g. seconds after the last socket closes). We persist the encoded state
	// into the DO's SQLite storage here so a note survives between sessions.
	//
	// Throttle persistence writes: `onSave` fires (debounced) on every document
	// update; without a wait it would write the full snapshot on every keystroke
	// batch.
	static callbackOptions = {
		debounceWait: 2000,
		debounceMaxWait: 10_000,
	};

	async onLoad() {
		const stored = await this.ctx.storage.get<Uint8Array | ArrayBuffer>(DOC_STORAGE_KEY);
		if (!stored) return;
		const bytes = stored instanceof Uint8Array ? stored : new Uint8Array(stored);
		const doc = new Doc();
		applyUpdate(doc, bytes);
		return doc;
	}

	async onSave() {
		const update = encodeStateAsUpdate(this.document);
		await this.ctx.storage.put(DOC_STORAGE_KEY, update);
	}
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
