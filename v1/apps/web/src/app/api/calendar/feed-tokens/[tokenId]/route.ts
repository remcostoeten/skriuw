import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { revokeJournalFeedToken } from "@/domain/journal/feed-tokens";

type Context = { params: Promise<{ tokenId: string }> };

export async function DELETE(_request: Request, context: Context) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const { tokenId } = await context.params;
	await revokeJournalFeedToken(user.id, tokenId);
	return NextResponse.json({ ok: true });
}
