import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

type DbClient = Pick<PrismaClient, "folder" | "note" | "journalEntry">;

export class PersistenceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PersistenceError";
	}
}

// Prisma throws P2025 when an `update`/`delete` with an extended unique `where`
// (e.g. { id, userId, deletedAt: null }) matches no row. We rely on that to do
// ownership-scoped writes in a single round trip instead of updateMany + findFirst.
export function isRecordNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { code?: unknown }).code === "P2025"
	);
}

export async function assertOwnedParentFolder(
	db: DbClient,
	userId: string,
	parentId: string | null,
): Promise<void> {
	if (!parentId) return;

	const folder = await db.folder.findFirst({
		where: { id: parentId, userId, deletedAt: null },
		select: { id: true },
	});
	if (!folder) {
		throw new PersistenceError("Parent folder not found");
	}
}

export async function assertResourceIdAvailable(
	db: DbClient,
	table: "folder" | "note" | "journalEntry",
	id: string,
	userId: string,
): Promise<void> {
	let existing: { userId: string } | null = null;

	switch (table) {
		case "folder":
			existing = await db.folder.findFirst({
				where: { id },
				select: { userId: true },
			});
			break;
		case "note":
			existing = await db.note.findFirst({
				where: { id },
				select: { userId: true },
			});
			break;
		case "journalEntry":
			existing = await db.journalEntry.findFirst({
				where: { id },
				select: { userId: true },
			});
			break;
	}

	if (existing && existing.userId !== userId) {
		throw new PersistenceError(`${table} id is not available`);
	}
}
