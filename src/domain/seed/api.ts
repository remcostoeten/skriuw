"use server";

import { getAuthenticatedUser } from "@/core/db";
import { loadActiveSeedBundle } from "@/domain/seed/queries";
import type { SeedJournalEntry, SeedTag } from "@/domain/seed/types";
import { Prisma } from "@/generated/prisma/client";

/**
 * Seeds a fresh user's workspace from the active SeedBundle row in the DB.
 *
 * Behavior:
 * - If `starterSeededAt` is set on the user, returns immediately (single field
 *   check; zero extra queries on repeat page loads).
 * - If no SeedBundle is marked active, returns immediately.
 * - Otherwise clones folders + notes (+ tags, journals) into the user's
 *   workspace in a single transaction, then stamps `starterSeededAt`.
 */
export async function ensureCloudStarterContentSeeded(): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	const userId = user.id;

	await prisma.$transaction(
		async (tx) => {
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

			const bundle = await loadActiveSeedBundle();
			if (!bundle) {
				return;
			}

			const { folders, notes, tags, journals } = bundle.payload;
			if (
				folders.length === 0 &&
				notes.length === 0 &&
				tags.length === 0 &&
				journals.length === 0
			) {
				return;
			}

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
						content: "",
						richContent: (note.richContent ?? []) as Prisma.InputJsonValue,
						preferredEditorMode: note.preferredEditorMode ?? "block",
						parentId: note.parentRef ? resolveRef(note.parentRef) : null,
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
		},
		{
			isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
		},
	);
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
