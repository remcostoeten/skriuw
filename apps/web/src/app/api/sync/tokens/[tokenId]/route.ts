import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { revokeSyncToken } from "@/domain/sync/tokens";

type RouteContext = {
	params: Promise<{ tokenId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

	const { tokenId } = await context.params;
	await revokeSyncToken(user.id, tokenId);
	return NextResponse.json({ ok: true });
}
