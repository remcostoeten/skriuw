import { loadActiveSeedBundle, type ActiveSeedBundle } from "@/domain/seed/queries";
import type { SeedJournalEntry, SeedTag } from "@/domain/seed/types";
import { richDocumentToSearchableMarkdown } from "@/domain/notes/rich-document";
import type { RichTextDocument } from "@/types/notes";
import { Prisma } from "@/generated/prisma/client";
import { prisma as rootPrisma } from "@/lib/prisma";

const SEED_TX_MAX_ATTEMPTS = 3;

function isTransactionConflict(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEmptyPayload(payload: ActiveSeedBundle["payload"]): boolean {
	const { folders, notes, tags, journals } = payload;
	return (
		folders.length === 0 &&
		notes.length === 0 &&
		tags.length === 0 &&
		journals.length === 0
	);
}

/** Seeds starter content for a user id (signup provisioning, admin scripts). */
export async function ensureStarterContentForUserId(userId: string): Promise<void> {
	const userRow = await rootPrisma.user.findUnique({
		where: { id: userId },
		select: { starterSeededAt: true },
	});
	if (userRow?.starterSeededAt) {
		return;
	}

	const bundle = await loadActiveSeedBundle();
	if (!bundle || isEmptyPayload(bundle.payload)) {
		return;
	}

	for (let attempt = 1; attempt <= SEED_TX_MAX_ATTEMPTS; attempt++) {
		try {
			await seedUserWorkspace(userId, bundle);
			return;
		} catch (error) {
			if (!isTransactionConflict(error) || attempt === SEED_TX_MAX_ATTEMPTS) {
				throw error;
			}
			await sleep(25 * attempt);
		}
	}
}

async function seedUserWorkspace(userId: string, bundle: ActiveSeedBundle): Promise<void> {
	await rootPrisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;

		const currentUser = await tx.user.findUnique({
			where: { id: userId },
			select: { starterSeededAt: true },
		});

		if (currentUser?.starterSeededAt) {
			return;
		}

		const [existingNote, existingFolder] = await Promise.all([
			tx.note.findFirst({ where: { userId, deletedAt: null }, select: { id: true } }),
			tx.folder.findFirst({ where: { userId, deletedAt: null }, select: { id: true } }),
		]);
		if (existingNote || existingFolder) {
			await tx.user.update({
				where: { id: userId },
				data: { starterSeededAt: new Date() },
			});
			return;
		}

		const { folders, notes, tags, journals } = bundle.payload;

		const idFor = new Map<string, string>();
		function resolveRef(ref: string): string {
			const existing = idFor.get(ref);
			if (existing) return existing;
			const uuid = crypto.randomUUID();
			idFor.set(ref, uuid);
			return uuid;
		}

		if (folders.length > 0) {
			const depthFor = computeFolderDepth(folders);
			const ordered = [...folders].sort((a, b) => {
				const da = depthFor.get(a.ref) ?? 0;
				const db = depthFor.get(b.ref) ?? 0;
				return da - db || a.order - b.order;
			});

			await tx.folder.createMany({
				data: ordered.map((folder) => ({
					id: resolveRef(folder.ref),
					userId,
					name: folder.name,
					parentId: folder.parentRef ? resolveRef(folder.parentRef) : null,
				})),
			});
		}

		if (notes.length > 0) {
			await tx.note.createMany({
				data: notes.map((note) => ({
					id: resolveRef(note.ref),
					userId,
					name: note.name,
					content:
						note.content?.trim() ||
						richDocumentToSearchableMarkdown(
							(note.richContent ?? []) as RichTextDocument,
						),
					richContent: (note.richContent ?? []) as Prisma.InputJsonValue,
					preferredEditorMode: note.preferredEditorMode ?? "block",
					parentId: note.parentRef ? resolveRef(note.parentRef) : null,
					tags: note.tags ?? [],
				})),
			});
		}

		if (tags.length > 0) {
			await tx.journalTag.createMany({
				data: tags.map((tag: SeedTag) => ({
					id: resolveRef(tag.ref),
					userId,
					name: tag.name,
					color: tag.color,
				})),
			});
		}

		if (journals.length > 0) {
			await tx.journalEntry.createMany({
				data: journals.map((entry: SeedJournalEntry) => ({
					id: resolveRef(entry.ref),
					userId,
					dateKey: entry.dateKey,
					content: entry.content,
					mood: entry.mood ?? null,
					tags: entry.tags ?? [],
				})),
			});
		}

		await tx.user.update({
			where: { id: userId },
			data: { starterSeededAt: new Date() },
		});
	});
}

function computeFolderDepth(
	folders: ReadonlyArray<{ ref: string; parentRef: string | null }>,
): Map<string, number> {
	const byRef = new Map(folders.map((f) => [f.ref, f]));
	const depths = new Map<string, number>();

	function depthOf(ref: string, seen: Set<string>): number {
		const cached = depths.get(ref);
		if (cached !== undefined) return cached;
		if (seen.has(ref)) return 0;
		seen.add(ref);

		const folder = byRef.get(ref);
		const parentRef = folder?.parentRef ?? null;
		const depth = parentRef ? depthOf(parentRef, seen) + 1 : 0;
		depths.set(ref, depth);
		return depth;
	}

	for (const folder of folders) {
		depthOf(folder.ref, new Set());
	}
	return depths;
}
