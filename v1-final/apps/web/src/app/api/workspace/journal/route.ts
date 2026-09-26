import { NextResponse } from "next/server";
import { isDateKey, isMoodLevel } from "@skriuw/domain/journal";
import { createJournalEntry, listJournalEntries } from "@/domain/journal/actions";
import type { MoodLevel } from "@/domain/journal/models";
import { requireWorkspaceUser, unauthorized } from "../_shared";

function serialize(entry: Awaited<ReturnType<typeof createJournalEntry>>) {
	return {
		...entry,
		createdAt: entry.createdAt.toISOString(),
		updatedAt: entry.updatedAt.toISOString(),
	};
}

export async function GET() {
	if (!(await requireWorkspaceUser())) return unauthorized();
	return NextResponse.json((await listJournalEntries()).map(serialize));
}

export async function POST(request: Request) {
	if (!(await requireWorkspaceUser())) return unauthorized();
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
	}
	if (!isDateKey(body.dateKey)) {
		return NextResponse.json({ error: "`dateKey` must use YYYY-MM-DD." }, { status: 400 });
	}
	const mood: MoodLevel | undefined = isMoodLevel(body.mood) ? body.mood : undefined;
	const entry = await createJournalEntry({
		dateKey: body.dateKey,
		title: typeof body.title === "string" ? body.title : null,
		content: typeof body.content === "string" ? body.content : "",
		tags: Array.isArray(body.tags)
			? body.tags.filter((tag): tag is string => typeof tag === "string")
			: [],
		mood,
	});
	return NextResponse.json(serialize(entry), { status: 201 });
}
