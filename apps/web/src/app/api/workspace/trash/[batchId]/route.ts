import { restoreTrashBatch, purgeTrashBatch } from "@/domain/trash/actions";
import { requireWorkspaceUser, unauthorized } from "../../_shared";

type RouteParams = { params: Promise<{ batchId: string }> };

export async function PATCH(_request: Request, { params }: RouteParams) {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	const { batchId } = await params;
	await restoreTrashBatch(decodeURIComponent(batchId));
	return new Response(null, { status: 204 });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	const { batchId } = await params;
	await purgeTrashBatch(decodeURIComponent(batchId));
	return new Response(null, { status: 204 });
}
