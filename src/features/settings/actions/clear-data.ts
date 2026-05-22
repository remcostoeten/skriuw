"use server";

import { getAuthenticatedUser } from "@/core/db";

const CLEAR_PHRASE = "clear my data";

export type ClearDataResult = { ok: true } | { ok: false; error: string };

export async function clearAllData(confirmation: string): Promise<ClearDataResult> {
	if (confirmation.trim().toLowerCase() !== CLEAR_PHRASE) {
		return { ok: false, error: "Confirmation did not match." };
	}

	let prisma: Awaited<ReturnType<typeof getAuthenticatedUser>>["prisma"];
	let userId: string;
	try {
		const { prisma: p, user } = await getAuthenticatedUser();
		prisma = p;
		userId = user.id;
	} catch {
		return { ok: false, error: "Not authenticated." };
	}

	const now = new Date();
	try {
		await prisma.$transaction([
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
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : "Could not clear data" };
	}

	return { ok: true };
}
