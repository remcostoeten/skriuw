import { NextResponse } from "next/server";
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
	const auth = await authenticateSyncBearer(request, undefined, { updateLastUsedAt: false });
	if (!auth) {
		return NextResponse.json(
			{ error: "Invalid sync token." },
			{ status: 401, headers: CORS_HEADERS },
		);
	}

	const rateLimit = await checkSyncRateLimit(auth.tokenId, "verify");
	if (!rateLimit.allowed) {
		return NextResponse.json(
			{ error: "Too many requests. Try again in a minute." },
			{ status: 429, headers: CORS_HEADERS },
		);
	}

	return NextResponse.json(
		{
			ok: true,
			token: {
				id: auth.tokenId,
				name: auth.name,
				scopes: auth.scopes,
				canWrite: auth.scopes.includes("sync:write"),
				expiresAt: auth.expiresAt?.toISOString() ?? null,
			},
		},
		{ headers: CORS_HEADERS },
	);
}
