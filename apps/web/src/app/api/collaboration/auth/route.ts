import { getServerUser } from "@/core/db";
import { prisma } from "@/lib/prisma";
import { resolveNoteAccess } from "@/domain/notes/note-access";
import {
	deriveAvatarColor,
	signCollabToken,
} from "@/features/collaboration/lib/collab-token";

export const dynamic = "force-dynamic";

// How long a minted room token is valid. Short — the client re-fetches on
// reconnect, so a revoked collaborator loses access within this window.
const TOKEN_TTL_MS = 5 * 60 * 1000;

function getSecret(): string | null {
	const secret = process.env.COLLAB_AUTH_SECRET;
	if (secret) return secret;
	// Dev convenience only, and only when explicitly running on localhost — a
	// hardcoded fallback that also applied to unset-NODE_ENV preview/staging
	// deploys let anyone forge a token for any note/role against that PartyKit
	// instance. Real environments must always set COLLAB_AUTH_SECRET.
	if (process.env.NODE_ENV === "development") return "skriuw-collab-dev-secret";
	return null;
}

/**
 * Mints a signed room token for the BlockNote/Yjs PartyKit room of a note.
 * Reuses the exact same access gate as the read/write paths — no new
 * permission logic. Viewers get a token tagged `viewer` (the client renders
 * the editor read-only); editors/owners get write tokens.
 */
export async function POST(request: Request) {
	const { user } = await getServerUser();
	if (!user) return new Response("Unauthorized", { status: 401 });

	let noteId: unknown;
	try {
		({ noteId } = (await request.json()) as { noteId?: unknown });
	} catch {
		return new Response("Bad Request", { status: 400 });
	}
	if (typeof noteId !== "string" || noteId.length === 0) {
		return new Response("Bad Request", { status: 400 });
	}

	const access = await resolveNoteAccess(prisma, user.id, noteId);
	if (!access) return new Response("Forbidden", { status: 403 });

	const secret = getSecret();
	if (!secret) {
		return new Response("Collaboration not configured", { status: 503 });
	}

	const name = user.name ?? user.email ?? "Anonymous";
	const storedColor = (user as { avatarColor?: string | null }).avatarColor;
	const color = storedColor ?? deriveAvatarColor(user.id);

	const token = await signCollabToken(
		{
			noteId,
			userId: user.id,
			name,
			color,
			role: access.role,
			exp: Date.now() + TOKEN_TTL_MS,
		},
		secret,
	);

	return Response.json({
		token,
		role: access.role,
		host: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "127.0.0.1:8787",
		user: { name, color },
	});
}
