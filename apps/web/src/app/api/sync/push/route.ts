import { NextResponse } from "next/server";
import { prisma } from "@/core/db";
import { recordSyncEvent } from "@/domain/sync/activity";
import { pushDesktopWorkspace, type DesktopPushPayload } from "@/domain/sync/push-workspace-server";
import { authenticateSyncBearer, checkSyncRateLimit, SYNC_WRITE_SCOPE } from "@/domain/sync/tokens";

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
	const auth = await authenticateSyncBearer(request, SYNC_WRITE_SCOPE);
	if (!auth)
		return NextResponse.json(
			{ error: "Invalid or non-writable sync token." },
			{ status: 401, headers: CORS },
		);
	const rate = await checkSyncRateLimit(auth.tokenId, "push");
	if (!rate.allowed)
		return NextResponse.json(
			{ error: "Too many sync requests." },
			{ status: 429, headers: CORS },
		);
	const declared = Number(request.headers.get("content-length") ?? 0);
	if (declared > 20 * 1024 * 1024)
		return NextResponse.json(
			{ error: "Sync snapshot exceeds 20 MB." },
			{ status: 413, headers: CORS },
		);
	try {
		const text = await request.text();
		if (new TextEncoder().encode(text).length > 20 * 1024 * 1024) {
			return NextResponse.json(
				{ error: "Sync snapshot exceeds 20 MB." },
				{ status: 413, headers: CORS },
			);
		}
		const payload = JSON.parse(text) as DesktopPushPayload;
		if (
			!Array.isArray(payload.notes) ||
			!Array.isArray(payload.folders) ||
			!Array.isArray(payload.journalEntries)
		)
			throw new Error("Invalid sync snapshot.");
		const result = await pushDesktopWorkspace(prisma, auth.userId, payload);
		await recordSyncEvent({
			userId: auth.userId,
			tokenId: auth.tokenId,
			operation: "push",
			status: "success",
			message: `${result.created} created, ${result.updated} updated, ${result.conflicts} conflicts`,
			source: "desktop-sync",
		}).catch(() => undefined);
		return NextResponse.json(result, {
			headers: CORS,
		});
	} catch (error) {
		console.error("[sync/push] failed", error);
		const message =
			error instanceof SyntaxError
				? "Invalid sync snapshot."
				: "Sync could not be committed.";
		await recordSyncEvent({
			userId: auth.userId,
			tokenId: auth.tokenId,
			operation: "push",
			status: "error",
			message,
			source: "desktop-sync",
		}).catch(() => undefined);
		return NextResponse.json({ error: message }, { status: 400, headers: CORS });
	}
}
