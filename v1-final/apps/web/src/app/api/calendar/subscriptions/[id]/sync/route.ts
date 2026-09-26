import { NextResponse } from "next/server";
import { prisma, tryGetAuthenticatedUser } from "@/core/db";
import { syncCalendarSubscription } from "@/domain/journal/calendar-subscriptions";
import { checkRateLimit } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const limit = await checkRateLimit(`calendar-subscription-sync:${user.id}`, 10, 60 * 60 * 1000);
	if (!limit.allowed) {
		return NextResponse.json({ error: "Too many syncs. Try again later." }, { status: 429 });
	}
	const { id } = await context.params;
	const subscription = await prisma.calendarSubscription.findFirst({
		where: { id, userId: user.id },
		select: { id: true, userId: true, url: true, label: true, mode: true },
	});
	if (!subscription) {
		return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
	}
	const outcome = await syncCalendarSubscription(subscription);
	return NextResponse.json({ outcome }, { status: outcome.status === "ok" ? 200 : 502 });
}
