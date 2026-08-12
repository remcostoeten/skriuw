import { NextResponse } from "next/server";
import { createFolder } from "@/domain/folders/actions";
import { requireWorkspaceUser, unauthorized } from "../_shared";

export async function GET() {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	// Direct query rather than the shared `listFolders()` domain helper: that
	// helper's `NoteFolder` shape has no `updatedAt`, which the mobile `Folder`
	// type requires.
	const folders = await ctx.prisma.folder.findMany({
		where: { userId: ctx.user.id, deletedAt: null },
		orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
		select: { id: true, name: true, parentId: true, sortOrder: true, updatedAt: true },
	});

	return NextResponse.json(
		folders.map((folder) => ({
			id: folder.id,
			name: folder.name,
			parentId: folder.parentId,
			sortOrder: folder.sortOrder,
			updatedAt: folder.updatedAt.toISOString(),
		})),
	);
}

type CreatePayload = {
	name?: unknown;
	parentId?: unknown;
	sortOrder?: unknown;
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

	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name) {
		return NextResponse.json({ error: "`name` is required." }, { status: 400 });
	}

	const folder = await createFolder({
		name,
		parentId: typeof body.parentId === "string" ? body.parentId : null,
		sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
	});

	return NextResponse.json(
		{
			id: folder.id,
			name: folder.name,
			parentId: folder.parentId,
			sortOrder: folder.sortOrder,
			updatedAt: new Date().toISOString(),
		},
		{ status: 201 },
	);
}
