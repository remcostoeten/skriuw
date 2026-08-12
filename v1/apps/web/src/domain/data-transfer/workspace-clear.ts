import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type WorkspaceClient = PrismaClient | Prisma.TransactionClient;

/**
 * Removes workspace rows so re-imported export IDs can be inserted again.
 * Accepts a transaction client so callers can run the clear as the first
 * statement of a larger transaction (e.g. clear + restore atomically).
 */
export async function hardClearUserWorkspace(
	client: WorkspaceClient,
	userId: string,
): Promise<void> {
	await Promise.all([
		client.noteShare.deleteMany({ where: { userId } }),
		client.noteVersion.deleteMany({ where: { userId } }),
		client.note.deleteMany({ where: { userId } }),
		client.folder.deleteMany({ where: { userId } }),
		client.journalEntry.deleteMany({ where: { userId } }),
		client.journalTag.deleteMany({ where: { userId } }),
		client.userRecent.deleteMany({ where: { userId } }),
	]);
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
