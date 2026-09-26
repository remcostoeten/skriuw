import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import { fetchIcsFromUrl } from "@/lib/safe-fetch-ics";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

/**
 * Raw ICS proxy for local/guest-mode calendar sync: iCloud/Google/Outlook
 * feeds don't send CORS headers, so the browser can't fetch them directly.
 * No auth required (local mode has no server session) — rate-limited by IP.
 */
export async function POST(request: Request) {
	const { user } = await tryGetAuthenticatedUser();
	const limitKey = user
		? `calendar-subscription-fetch:${user.id}`
		: `calendar-subscription-fetch:ip:${getRequestIp(request.headers)}`;
	const limit = await checkRateLimit(limitKey, 48, 60 * 60 * 1000);
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "Too many sync attempts. Try again later." },
			{ status: 429 },
		);
	}
	const body = (await request.json().catch(() => ({}))) as { url?: string };
	if (!body.url) {
		return NextResponse.json({ error: "A calendar URL is required." }, { status: 400 });
	}
	try {
		const ics = await fetchIcsFromUrl(body.url);
		return NextResponse.json({ ics });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Could not fetch that calendar." },
			{ status: 400 },
		);
	}
}
