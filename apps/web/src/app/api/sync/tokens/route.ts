import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { createSyncToken, listSyncTokens } from "@/domain/sync/tokens";

export async function GET() {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

	const tokens = await listSyncTokens(user.id);
	return NextResponse.json({ tokens });
}

export async function POST(request: NextRequest) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		expiresAt?: string | null;
	};

	try {
		const syncToken = await createSyncToken({
			userId: user.id,
			name: body.name,
			expiresAt: body.expiresAt,
		});
		return NextResponse.json({ token: syncToken }, { status: 201 });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Could not create sync token." },
			{ status: 400 },
		);
	}
}
