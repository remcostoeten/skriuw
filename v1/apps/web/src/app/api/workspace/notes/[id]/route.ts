import { NextResponse } from "next/server";
import { deleteNote, updateNote } from "@/domain/notes/actions";
import { getNote } from "@/domain/notes/queries";
import { noteToFull, notFound, requireWorkspaceUser, unauthorized } from "../../_shared";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	const { id } = await params;
	const note = await getNote(id);
	if (!note) return notFound();

	return NextResponse.json(noteToFull(note));
}

type UpdatePayload = {
	title?: unknown;
	content?: unknown;
	folderId?: unknown;
	sortOrder?: unknown;
};

export async function PATCH(request: Request, { params }: RouteParams) {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	const { id } = await params;

	let body: UpdatePayload;
	try {
		body = (await request.json()) as UpdatePayload;
	} catch {
		return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
	}

	// Precondition check: fetch-then-compare rather than an atomic conditional
	// write, since it wraps the existing `updateNote` transaction rather than
	// forking it. Good enough for the mobile MVP's conflict-detection needs.
	const preconditionHeader = request.headers.get("if-unmodified-since");
	if (preconditionHeader) {
		const current = await getNote(id);
		if (!current) return notFound();

		const preconditionDate = new Date(preconditionHeader);
		if (
			!Number.isNaN(preconditionDate.getTime()) &&
			current.modifiedAt.getTime() > preconditionDate.getTime()
		) {
			return NextResponse.json(
				{ updatedAt: current.modifiedAt.toISOString() },
				{ status: 409 },
			);
		}
	}

	const folderId =
		body.folderId === null
			? null
			: typeof body.folderId === "string"
				? body.folderId
				: undefined;

	const result = await updateNote({
		id,
		name: typeof body.title === "string" ? body.title : undefined,
		content: typeof body.content === "string" ? body.content : undefined,
		parentId: folderId,
		sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
		trackHeading: false,
	});

	if (!result.note) return notFound();
	return NextResponse.json(noteToFull(result.note));
}

export async function DELETE(_request: Request, { params }: RouteParams) {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	const { id } = await params;
	await deleteNote(id);
	return new Response(null, { status: 204 });
}
