import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import {
	createCalendarSubscription,
	listCalendarSubscriptions,
} from "@/domain/journal/calendar-subscriptions";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET() {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	return NextResponse.json({ subscriptions: await listCalendarSubscriptions(user.id) });
}

export async function POST(request: Request) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const limit = await checkRateLimit(
		`calendar-subscription-create:${user.id}`,
		10,
		60 * 60 * 1000,
	);
	if (!limit.allowed) {
		return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
	}
	const body = (await request.json().catch(() => ({}))) as {
		url?: string;
		label?: string;
		mode?: string;
	};
	if (!body.url) {
		return NextResponse.json({ error: "A calendar URL is required." }, { status: 400 });
	}
	try {
		const subscription = await createCalendarSubscription(user.id, {
			url: body.url,
			label: body.label,
			mode: body.mode,
		});
		return NextResponse.json({ subscription }, { status: 201 });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Could not add that calendar." },
			{ status: 400 },
		);
	}
}
