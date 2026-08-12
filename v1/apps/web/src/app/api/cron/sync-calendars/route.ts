import { NextResponse } from "next/server";
import { syncDueCalendarSubscriptions } from "@/domain/journal/calendar-subscriptions";

export const maxDuration = 300;

/** Vercel cron entry point: daily fetch+import of all due external calendar subscriptions. */
export async function GET(request: Request) {
	const secret = process.env.CRON_SECRET;
	if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
		return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
	}
	const outcomes = await syncDueCalendarSubscriptions({ deadlineMs: 270_000 });
	return NextResponse.json({
		synced: outcomes.filter((outcome) => outcome.status === "ok").length,
		failed: outcomes.filter((outcome) => outcome.status === "error").length,
		created: outcomes.reduce((sum, outcome) => sum + outcome.created, 0),
		updated: outcomes.reduce((sum, outcome) => sum + outcome.updated, 0),
	});
}
