import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { parseJournalIcs } from "@/domain/journal/ics-import";
import { fetchIcsFromUrl } from "@/lib/safe-fetch-ics";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

/**
 * Read-only test fetch for the subscription setup wizard: never writes
 * entries. Also serves guest/local-mode clients (no auth), since iCloud/
 * Google/Outlook feeds don't send CORS headers and can't be fetched directly
 * from the browser — rate-limited by IP in that case instead of user id.
 */
export async function POST(request: Request) {
	const { user } = await tryGetAuthenticatedUser();
	const limitKey = user
		? `calendar-subscription-preview:${user.id}`
		: `calendar-subscription-preview:ip:${getRequestIp(request.headers)}`;
	const limit = await checkRateLimit(limitKey, 20, 60 * 60 * 1000);
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
