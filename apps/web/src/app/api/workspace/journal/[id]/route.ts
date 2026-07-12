import { NextResponse } from "next/server";
import { isMoodLevel } from "@skriuw/domain/journal";
import { deleteJournalEntry, updateJournalEntry } from "@/domain/journal/actions";
import type { MoodLevel } from "@/domain/journal/models";
import { notFound, requireWorkspaceUser, unauthorized } from "../../_shared";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
	if (!(await requireWorkspaceUser())) return unauthorized();
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
	}
	const { id } = await params;
	const mood: MoodLevel | null | undefined =
		body.mood === null ? null : isMoodLevel(body.mood) ? body.mood : undefined;
	const entry = await updateJournalEntry({
		id,
		title: body.title === null ? null : typeof body.title === "string" ? body.title : undefined,
		content: typeof body.content === "string" ? body.content : undefined,
		richContent: body.content !== undefined ? null : undefined,
		tags: Array.isArray(body.tags)
			? body.tags.filter((tag): tag is string => typeof tag === "string")
			: undefined,
		mood,
	});
	if (!entry) return notFound();
	return NextResponse.json({
		...entry,
		createdAt: entry.createdAt.toISOString(),
		updatedAt: entry.updatedAt.toISOString(),
	});
}

export async function DELETE(_request: Request, { params }: RouteParams) {
	if (!(await requireWorkspaceUser())) return unauthorized();
	await deleteJournalEntry((await params).id);
	return new Response(null, { status: 204 });
}
