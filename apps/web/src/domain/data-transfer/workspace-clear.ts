import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type WorkspaceClient = PrismaClient | Prisma.TransactionClient;

export async function softClearUserWorkspace(
	prisma: PrismaClient,
	userId: string,
): Promise<void> {
	const now = new Date();
	await prisma.$transaction([
		prisma.noteShare.updateMany({
			where: { userId, revokedAt: null },
			data: { revokedAt: now },
		}),
		prisma.noteVersion.deleteMany({ where: { userId } }),
		prisma.note.updateMany({
			where: { userId, deletedAt: null },
			data: { deletedAt: now },
		}),
		prisma.folder.updateMany({
			where: { userId, deletedAt: null },
			data: { deletedAt: now },
		}),
		prisma.journalEntry.updateMany({
			where: { userId, deletedAt: null },
			data: { deletedAt: now },
		}),
		prisma.journalTag.updateMany({
			where: { userId, deletedAt: null },
			data: { deletedAt: now },
		}),
		prisma.userRecent.deleteMany({ where: { userId } }),
	]);
}

/**
 * Removes workspace rows so re-imported export IDs can be inserted again.
 * Accepts a transaction client so callers can run the clear as the first
 * statement of a larger transaction (e.g. clear + restore atomically).
 */
export async function hardClearUserWorkspace(
	client: WorkspaceClient,
	userId: string,
): Promise<void> {
	await client.noteShare.deleteMany({ where: { userId } });
	await client.noteVersion.deleteMany({ where: { userId } });
	await client.note.deleteMany({ where: { userId } });
	await client.folder.deleteMany({ where: { userId } });
	await client.journalEntry.deleteMany({ where: { userId } });
	await client.journalTag.deleteMany({ where: { userId } });
	await client.userRecent.deleteMany({ where: { userId } });
}

export async function countUserWorkspace(prisma: PrismaClient, userId: string) {
	const [folders, notes, journalEntries, journalTags] = await Promise.all([
		prisma.folder.count({ where: { userId, deletedAt: null } }),
		prisma.note.count({ where: { userId, deletedAt: null } }),
		prisma.journalEntry.count({ where: { userId, deletedAt: null } }),
		prisma.journalTag.count({ where: { userId, deletedAt: null } }),
	]);
	return { folders, notes, journalEntries, journalTags };
}
