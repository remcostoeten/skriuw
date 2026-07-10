import { NextResponse } from "next/server";
import { createNoteForUser } from "@/domain/notes/note-write-core";
import { listNoteMetadata } from "@/domain/notes/queries";
import { noteToFull, noteToSummary, requireWorkspaceUser, unauthorized } from "../_shared";

export async function GET(request: Request) {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	const folderIdParam = new URL(request.url).searchParams.get("folderId");
	const notes = await listNoteMetadata();
	const filtered =
		folderIdParam === null
			? notes
			: notes.filter(
					(note) => note.parentId === (folderIdParam === "root" ? null : folderIdParam),
				);

	return NextResponse.json(filtered.map(noteToSummary));
}

type CreatePayload = {
	title?: unknown;
	content?: unknown;
	folderId?: unknown;
};

export async function POST(request: Request) {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	let body: CreatePayload;
	try {
		body = (await request.json()) as CreatePayload;
	} catch {
		return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
	}

	const title = typeof body.title === "string" ? body.title.trim() : "";
	if (!title) {
		return NextResponse.json({ error: "`title` is required." }, { status: 400 });
	}

	const note = await createNoteForUser(ctx.prisma, ctx.user.id, {
		name: title,
		content: typeof body.content === "string" ? body.content : "",
		parentId: typeof body.folderId === "string" ? body.folderId : null,
	});

	return NextResponse.json(noteToFull(note), { status: 201 });
}
