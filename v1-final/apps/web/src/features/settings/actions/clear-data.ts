"use server";

import { tryGetAuthenticatedUser } from "@/core/db";

const CLEAR_PHRASE = "clear my data";

export type ClearDataResult = { ok: true } | { ok: false; error: string };

export async function clearAllData(confirmation: string): Promise<ClearDataResult> {
	if (confirmation.trim().toLowerCase() !== CLEAR_PHRASE) {
		return { ok: false, error: "Confirmation did not match." };
	}

	let prisma: Awaited<ReturnType<typeof tryGetAuthenticatedUser>>["prisma"];
	let userId: string;
	try {
		const result = await tryGetAuthenticatedUser();
		if (!result.user) {
			return { ok: false, error: "Not authenticated." };
		}
		prisma = result.prisma;
		userId = result.user.id;
	} catch (error) {
		console.error("Failed to clear data due to infrastructure error.", error);
		return { ok: false, error: "Could not clear data right now." };
	}

	const now = new Date();
	try {
		await prisma.$transaction([
			prisma.noteShare.updateMany({
				where: { userId, revokedAt: null },
				data: { revokedAt: now },
			}),
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
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Could not clear data",
		};
	}

	return { ok: true };
}
