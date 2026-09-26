import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { listSyncEvents } from "@/domain/sync/activity";
import { authenticateSyncBearer, checkSyncRateLimit, readBearerToken } from "@/domain/sync/tokens";

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
	const bearer = readBearerToken(request);
	const auth = bearer
		? await authenticateSyncBearer(request, undefined, { updateLastUsedAt: false })
		: null;
	if (bearer && !auth) {
		return NextResponse.json(
			{ error: "Invalid sync token." },
			{ status: 401, headers: CORS_HEADERS },
		);
	}
	const session = auth ? null : await tryGetAuthenticatedUser();
	const userId = auth?.userId ?? session?.user?.id;

	if (!userId) {
		return NextResponse.json(
			{ error: "Not authenticated." },
			{ status: 401, headers: CORS_HEADERS },
		);
	}

	if (auth) {
		const rateLimit = await checkSyncRateLimit(auth.tokenId, "activity");
		if (!rateLimit.allowed) {
			return NextResponse.json(
				{ error: "Too many requests. Try again in a minute." },
				{ status: 429, headers: CORS_HEADERS },
			);
		}
	}

	const { searchParams } = new URL(request.url);
	const limit = Number(searchParams.get("limit") ?? "25");
	const tokenId = searchParams.get("tokenId");
	const events = await listSyncEvents(userId, Number.isFinite(limit) ? limit : 25, tokenId);
	return NextResponse.json({ events }, { headers: CORS_HEADERS });
}
