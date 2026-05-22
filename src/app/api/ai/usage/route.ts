import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { listAiUsageLogs } from "@/domain/ai/usage";
import { normalizeAiUsagePagination } from "@/domain/ai/usage-utils";

export async function GET(req: NextRequest) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const url = new URL(req.url);
	const { limit, offset } = normalizeAiUsagePagination({
		limit: Number(url.searchParams.get("limit") ?? 20),
		offset: Number(url.searchParams.get("offset") ?? 0),
	});
	const usage = await listAiUsageLogs({ userId: user.id, limit, offset });
	return NextResponse.json({ usage, nextOffset: usage.length === limit ? offset + limit : null });
}
