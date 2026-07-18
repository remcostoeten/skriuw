import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { parseJournalIcs } from "@/domain/journal/ics-import";
import { fetchIcsFromUrl } from "@/lib/safe-fetch-ics";
import { checkRateLimit } from "@/lib/rate-limit";

/** Read-only test fetch for the subscription setup wizard: never writes entries. */
export async function POST(request: Request) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const limit = await checkRateLimit(
		`calendar-subscription-preview:${user.id}`,
		20,
		60 * 60 * 1000,
	);
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "Too many test fetches. Try again later." },
			{ status: 429 },
		);
	}
	const body = (await request.json().catch(() => ({}))) as { url?: string };
	if (!body.url) {
		return NextResponse.json({ error: "A calendar URL is required." }, { status: 400 });
	}
	try {
		const text = await fetchIcsFromUrl(body.url);
		const parsed = parseJournalIcs(text);
		return NextResponse.json({
			preview: {
				calendarName: parsed.calendarName ?? null,
				importable: parsed.events.length,
				skipped: parsed.skipped.length,
				sampleTitles: parsed.events
					.slice(0, 3)
					.map((event) => event.title || event.dateKey),
			},
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Could not fetch that calendar." },
			{ status: 400 },
		);
	}
}
