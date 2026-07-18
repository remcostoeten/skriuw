import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import {
	deleteCalendarSubscription,
	updateCalendarSubscription,
} from "@/domain/journal/calendar-subscriptions";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const { id } = await context.params;
	const body = (await request.json().catch(() => ({}))) as {
		label?: string;
		mode?: string;
		enabled?: boolean;
	};
	const subscription = await updateCalendarSubscription(user.id, id, body);
	if (!subscription) {
		return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
	}
	return NextResponse.json({ subscription });
}

export async function DELETE(_request: Request, context: RouteContext) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const { id } = await context.params;
	await deleteCalendarSubscription(user.id, id);
	return NextResponse.json({ ok: true });
}
