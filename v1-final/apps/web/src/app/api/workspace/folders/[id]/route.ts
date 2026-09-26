import { NextResponse } from "next/server";
import { deleteFolder, updateFolder } from "@/domain/folders/actions";
import { notFound, requireWorkspaceUser, unauthorized } from "../../_shared";

type RouteParams = { params: Promise<{ id: string }> };

type UpdatePayload = {
	name?: unknown;
	parentId?: unknown;
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

	const parentId =
		body.parentId === null
			? null
			: typeof body.parentId === "string"
				? body.parentId
				: undefined;

	const folder = await updateFolder({
		id,
		name: typeof body.name === "string" ? body.name : undefined,
		parentId,
		sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
	});

	if (!folder) return notFound();

	return NextResponse.json({
		id: folder.id,
		name: folder.name,
		parentId: folder.parentId,
		sortOrder: folder.sortOrder,
		updatedAt: new Date().toISOString(),
	});
}

export async function DELETE(_request: Request, { params }: RouteParams) {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	const { id } = await params;
	await deleteFolder(id);
	return new Response(null, { status: 204 });
}
