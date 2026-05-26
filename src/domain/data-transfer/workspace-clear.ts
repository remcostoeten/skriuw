import type { PrismaClient } from "@/generated/prisma/client";

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

export async function countUserWorkspace(prisma: PrismaClient, userId: string) {
	const [folders, notes, journalEntries, journalTags] = await Promise.all([
		prisma.folder.count({ where: { userId, deletedAt: null } }),
		prisma.note.count({ where: { userId, deletedAt: null } }),
		prisma.journalEntry.count({ where: { userId, deletedAt: null } }),
		prisma.journalTag.count({ where: { userId, deletedAt: null } }),
	]);
	return { folders, notes, journalEntries, journalTags };
}
