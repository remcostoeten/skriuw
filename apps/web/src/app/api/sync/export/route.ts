import { NextResponse } from "next/server";
import { prisma } from "@/core/db";
import { buildWorkspaceExportResponse } from "@/domain/data-transfer/export-workspace";
import { authenticateSyncBearer } from "@/domain/sync/tokens";

/**
 * The desktop app pulls this endpoint from a different origin (the Tauri webview
 * — `tauri://localhost`, or `http://127.0.0.1:1421` in dev), so the response
 * needs permissive CORS. Auth is by Bearer token (not cookies), so a wildcard
 * origin exposes nothing a request without the token could not already see.
 */
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

	const { searchParams } = new URL(request.url);
	const includeVersions = searchParams.get("includeVersions") !== "false";

	const response = await buildWorkspaceExportResponse({
		prisma,
		userId: auth.userId,
		includeVersions,
	});
	for (const [header, value] of Object.entries(CORS_HEADERS)) {
		response.headers.set(header, value);
	}
	return response;
}
