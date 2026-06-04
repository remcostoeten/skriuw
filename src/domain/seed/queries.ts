import { prisma } from "@/lib/prisma";
import type {
	SeedBundlePayload,
	SeedFolder,
	SeedJournalEntry,
	SeedNote,
	SeedTag,
} from "./types";

export type ActiveSeedBundle = {
	id: string;
	name: string;
	payload: SeedBundlePayload;
	updatedAt: Date;
};

function asArray<T>(value: unknown): T[] {
	return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Read the currently active seed bundle. Returns null when no bundle has
 * been marked active — in that case new signups get an empty workspace by
 * design (see ADMIN_SEED_PLAN.md §1).
 */
export async function loadActiveSeedBundle(): Promise<ActiveSeedBundle | null> {
	const row = await prisma.seedBundle.findFirst({
		where: { isActive: true },
		select: {
			id: true,
			name: true,
			folders: true,
			notes: true,
			tags: true,
			journals: true,
			updatedAt: true,
		},
	});

	if (!row) return null;

	return {
		id: row.id,
		name: row.name,
		updatedAt: row.updatedAt,
		payload: {
			folders: asArray<SeedFolder>(row.folders),
			notes: asArray<SeedNote>(row.notes),
			tags: asArray<SeedTag>(row.tags),
			journals: asArray<SeedJournalEntry>(row.journals),
		},
	};
}
