import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { createJournalFeedToken, listJournalFeedTokens } from "@/domain/journal/feed-tokens";

export async function GET() {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	return NextResponse.json({ tokens: await listJournalFeedTokens(user.id) });
}

export async function POST(request: Request) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const body = (await request.json().catch(() => ({}))) as { name?: string };
	try {
		const token = await createJournalFeedToken(user.id, body.name);
		return NextResponse.json({ token }, { status: 201 });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Could not create calendar link." },
			{ status: 400 },
		);
	}
}
