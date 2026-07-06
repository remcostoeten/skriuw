import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { rotateSyncToken } from "@/domain/sync/tokens";

type RouteContext = {
	params: Promise<{ tokenId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

	const { tokenId } = await context.params;
	const rotated = await rotateSyncToken(user.id, tokenId);
	if (!rotated) {
		return NextResponse.json(
			{ error: "Sync key not found or already revoked." },
			{ status: 404 },
		);
	}
	return NextResponse.json({ token: rotated }, { status: 201 });
}
