import { NextResponse } from "next/server";
import { emptyTrash, fetchTrashBatches } from "@/domain/trash/actions";
import { requireWorkspaceUser, unauthorized } from "../_shared";

export async function GET() {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	const batches = await fetchTrashBatches();
	return NextResponse.json(
		batches.map((batch) => ({
			...batch,
			deletedAt: batch.deletedAt.toISOString(),
		})),
	);
}

export async function DELETE() {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	await emptyTrash();
	return new Response(null, { status: 204 });
}
