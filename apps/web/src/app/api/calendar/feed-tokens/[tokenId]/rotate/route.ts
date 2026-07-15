import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { rotateJournalFeedToken } from "@/domain/journal/feed-tokens";

type Context = { params: Promise<{ tokenId: string }> };

export async function POST(_request: Request, context: Context) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const { tokenId } = await context.params;
	const token = await rotateJournalFeedToken(user.id, tokenId);
	if (!token) {
		return NextResponse.json({ error: "Calendar link not found or revoked." }, { status: 404 });
	}
	return NextResponse.json({ token }, { status: 201 });
}
