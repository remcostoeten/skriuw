import { NextResponse } from "next/server";
import { prisma } from "@/core/db";
import { createNoteForUser } from "@/domain/notes/note-write-core";
import { recordSyncEvent } from "@/domain/sync/activity";
import { authenticateSyncBearer, checkSyncRateLimit, SYNC_WRITE_SCOPE } from "@/domain/sync/tokens";

/**
 * Write endpoint for external clients (the browser clipper extension). Like
 * `sync/export`, it authenticates by Bearer token rather than a session cookie,
 * so the wildcard CORS origin is safe — a request without a write-scoped token
 * can create nothing. The extension only ever sends markdown; the note's rich
 * content is derived server-side by `createNoteForUser`.
 */
const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Max-Age": "86400",
};

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 500_000;
const MAX_TAGS = 64;
const MAX_TAG_LENGTH = 64;

type CapturePayload = {
	url?: unknown;
	title?: unknown;
	markdown?: unknown;
	selection?: unknown;
	tags?: unknown;
	parentId?: unknown;
	source?: unknown;
};

function corsJson(body: unknown, status: number) {
	return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function sanitizeTags(input: unknown): string[] {
	if (!Array.isArray(input)) return [];
	const seen = new Set<string>();
	for (const raw of input) {
		if (typeof raw !== "string") continue;
		const tag = raw.trim().replace(/^#/, "").slice(0, MAX_TAG_LENGTH);
		if (tag) seen.add(tag);
		if (seen.size >= MAX_TAGS) break;
	}
	return Array.from(seen);
}

function deriveTitle(title: unknown, url: string | null): string {
	if (typeof title === "string" && title.trim()) {
		return title.trim().slice(0, MAX_TITLE_LENGTH);
	}
	if (url) {
		try {
			return new URL(url).hostname;
		} catch {
			return "Web clip";
		}
	}
	return "Web clip";
}

function composeContent(title: string, url: string | null, markdown: string): string {
	const header = `# ${title}\n`;
	const source = url ? `\n_Source: [${url}](${url})_\n` : "";
	return `${header}${source}\n${markdown.trim()}\n`;
}

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
	const auth = await authenticateSyncBearer(request, SYNC_WRITE_SCOPE);
	if (!auth) {
		return corsJson({ error: "Invalid or non-writable sync token." }, 401);
	}

	const rateLimit = await checkSyncRateLimit(auth.tokenId, "capture");
	if (!rateLimit.allowed) {
		return corsJson({ error: "Too many captures. Slow down and try again shortly." }, 429);
	}

	let payload: CapturePayload;
	try {
		payload = (await request.json()) as CapturePayload;
	} catch {
		return corsJson({ error: "Request body must be valid JSON." }, 400);
	}

	const markdown = typeof payload.markdown === "string" ? payload.markdown : "";
	if (!markdown.trim()) {
		return corsJson({ error: "`markdown` is required." }, 400);
	}

	const url = typeof payload.url === "string" && payload.url.trim() ? payload.url.trim() : null;
	const title = deriveTitle(payload.title, url);
	const content = composeContent(title, url, markdown);
	if (content.length > MAX_CONTENT_LENGTH) {
		return corsJson({ error: "Captured content is too large." }, 413);
	}

	const parentId =
		typeof payload.parentId === "string" && payload.parentId.trim()
			? payload.parentId.trim()
			: null;

	try {
		const note = await createNoteForUser(prisma, auth.userId, {
			name: title,
			content,
			tags: sanitizeTags(payload.tags),
			parentId,
		});
		await recordSyncEvent({
			userId: auth.userId,
			tokenId: auth.tokenId,
			operation: "capture",
			status: "success",
			resourceId: note.id,
			resourceName: note.name,
			idempotencyKey: request.headers.get("idempotency-key"),
			source: typeof payload.source === "string" ? payload.source : "chrome-extension",
		}).catch(() => undefined);
		return corsJson({ id: note.id, name: note.name, path: `/app/notes/${note.id}` }, 201);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not save the clip.";
		await recordSyncEvent({
			userId: auth.userId,
			tokenId: auth.tokenId,
			operation: "capture",
			status: "error",
			message,
			idempotencyKey: request.headers.get("idempotency-key"),
			source: typeof payload.source === "string" ? payload.source : "chrome-extension",
		}).catch(() => undefined);
		return corsJson({ error: message }, 400);
	}
}
