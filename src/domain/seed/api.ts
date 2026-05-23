"use server";

import { loadActiveSeedBundle } from "@/features/admin/seed/server/queries";
import type { SeedJournalEntry, SeedTag } from "@/features/admin/seed/types";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Seeds a fresh user's workspace from the active SeedBundle row in the DB.
 *
 * Behavior:
 * - If the user already has any folder or note (deletedAt null), returns
 *   immediately. Existing users are never re-seeded.
 * - If no SeedBundle is marked active, returns immediately. New users start
 *   with an empty workspace by design — see ADMIN_SEED_PLAN.md §1.
 * - Otherwise, clones the bundle's folders + notes (+ tags, journals when
 *   authored) into the user's workspace inside a single transaction. Refs
 *   used inside the bundle to express parent relationships are remapped to
 *   fresh UUIDs before insert.
 *
 * Cross-note `noteLink` references resolve at render time via title lookup
 * (see features/notes/lib/note-links.ts), so no payload rewriting is needed
 * at seed time.
 */
export async function ensureCloudStarterContentSeeded(userId: string): Promise<void> {
	const [existingNote, existingFolder] = await Promise.all([
		prisma.note.findFirst({
			where: { userId, deletedAt: null },
			select: { id: true },
		}),
		prisma.folder.findFirst({
			where: { userId, deletedAt: null },
			select: { id: true },
		}),
	]);

	if (existingNote || existingFolder) {
		return;
	}

	const bundle = await loadActiveSeedBundle();
	if (!bundle) {
		return;
	}

	const { folders, notes, tags, journals } = bundle.payload;
	if (folders.length === 0 && notes.length === 0 && tags.length === 0 && journals.length === 0) {
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

	await prisma.$transaction(async (tx) => {
		if (folders.length > 0) {
			// Folders are inserted parent-first via depth-sort so parentId references resolve.
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
