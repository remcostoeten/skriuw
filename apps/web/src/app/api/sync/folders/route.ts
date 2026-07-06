import { NextResponse } from "next/server";
import { prisma } from "@/core/db";
import { recordSyncEvent } from "@/domain/sync/activity";
import { authenticateSyncBearer, checkSyncRateLimit } from "@/domain/sync/tokens";

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
	const auth = await authenticateSyncBearer(request);
	if (!auth) {
		return NextResponse.json(
			{ error: "Invalid sync token." },
			{ status: 401, headers: CORS_HEADERS },
		);
	}

	const rateLimit = await checkSyncRateLimit(auth.tokenId, "folders");
	if (!rateLimit.allowed) {
		return NextResponse.json(
			{ error: "Too many requests. Try again in a minute." },
			{ status: 429, headers: CORS_HEADERS },
		);
	}

	const folders = await prisma.folder.findMany({
		where: { userId: auth.userId, deletedAt: null },
		select: { id: true, name: true, parentId: true, sortOrder: true },
		orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
	});
	await recordSyncEvent({
		userId: auth.userId,
		tokenId: auth.tokenId,
		operation: "folders",
		status: "success",
		source: "chrome-extension",
	}).catch(() => undefined);

	return NextResponse.json({ folders }, { headers: CORS_HEADERS });
}
