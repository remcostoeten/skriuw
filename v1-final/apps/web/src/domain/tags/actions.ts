"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
	ChipRewriteResult,
	TaggedNoteSummary,
	TagSummary,
} from "@/core/workspace-backend/types";
import { rewriteNoteForTag } from "@/domain/notes/chip-rewrite";
import type { RichTextDocument } from "@/domain/notes/models";
import { syncNoteLinks } from "@/domain/notes/note-link-sync";
import { syncJournalLinks } from "@/domain/journal/journal-link-sync";
import type { NotePropertyColor } from "@/domain/notes/properties";
import { normalizeStoredTagEntry, normalizeTagName } from "@/domain/tags/normalize";

type TagDb = Pick<
	PrismaClient,
	"note" | "noteLink" | "noteTagMeta" | "journalEntry" | "journalLink" | "person"
>;

async function listTaggedJournalRecords(tx: TagDb, userId: string, name: string) {
	return tx.journalEntry.findMany({
		where: { userId, deletedAt: null, tags: { has: name } },
		select: {
			id: true,
			title: true,
			dateKey: true,
			content: true,
			richContent: true,
			tags: true,
			updatedAt: true,
		},
	});
}

async function rewriteTagAcrossJournals(
	tx: TagDb,
	userId: string,
	from: string,
	to: string | null,
): Promise<string[]> {
	const records = await listTaggedJournalRecords(tx, userId, from);
	const rewritten: string[] = [];
	const results = await Promise.all(
		records.map(async (record) => {
			const patch = rewriteNoteForTag(
				{
					content: record.content,
					richContent: (record.richContent as RichTextDocument | null) ?? [],
					tags: record.tags,
				},
				from,
				to,
			);
			if (!patch) return null;

			const data: Prisma.JournalEntryUncheckedUpdateInput = {};
			if (patch.content !== undefined) data.content = patch.content;
			if (patch.richContent !== undefined) {
				data.richContent = patch.richContent as Prisma.InputJsonValue;
			}
			if (patch.tags !== undefined) data.tags = patch.tags;

			const updated = await tx.journalEntry.update({
				where: { id: record.id, deletedAt: null },
				data,
				select: { id: true, content: true, richContent: true, tags: true },
			});
			await syncJournalLinks(tx, userId, {
				id: updated.id,
				content: updated.content,
				richContent: (updated.richContent as RichTextDocument | null) ?? [],
				tags: updated.tags,
			});
			return record.id;
		}),
	);
	rewritten.push(...results.filter((id): id is string => id !== null));
	return rewritten;
}

async function listTaggedNoteRecords(tx: TagDb, userId: string, name: string) {
	const links = await tx.noteLink.findMany({
		where: { userId, kind: "tag", targetLabel: name, sourceNote: { deletedAt: null } },
		select: { sourceNoteId: true },
	});
	const ids = [...new Set(links.map((link) => link.sourceNoteId))];
	if (ids.length === 0) return [];
	return tx.note.findMany({
		where: { id: { in: ids }, userId, deletedAt: null },
		select: {
			id: true,
			name: true,
			content: true,
			richContent: true,
			tags: true,
			updatedAt: true,
		},
	});
}

async function rewriteTagAcrossNotes(
	tx: TagDb,
	userId: string,
	from: string,
	to: string | null,
): Promise<string[]> {
	const records = await listTaggedNoteRecords(tx, userId, from);
	const rewritten: string[] = [];
	const results = await Promise.all(
		records.map(async (record) => {
			const patch = rewriteNoteForTag(
				{
					content: record.content,
					richContent: (record.richContent as RichTextDocument | null) ?? [],
					tags: record.tags,
				},
				from,
				to,
			);
			if (!patch) return null;

			const data: Prisma.NoteUncheckedUpdateInput = {};
			if (patch.content !== undefined) data.content = patch.content;
			if (patch.richContent !== undefined) {
				data.richContent = patch.richContent as Prisma.InputJsonValue;
			}
			if (patch.tags !== undefined) data.tags = patch.tags;

			const updated = await tx.note.update({
				where: { id: record.id, deletedAt: null },
				data,
				select: { id: true, content: true, richContent: true, tags: true },
			});
			await syncNoteLinks(tx, userId, {
				id: updated.id,
				content: updated.content,
				richContent: (updated.richContent as RichTextDocument | null) ?? [],
				tags: updated.tags,
			});
			return record.id;
		}),
	);
	rewritten.push(...results.filter((id): id is string => id !== null));
	return rewritten;
}

export async function listTags(): Promise<TagSummary[]> {
	const { prisma, user } = await getAuthenticatedUser();

	const [links, meta, journals] = await Promise.all([
		prisma.noteLink.findMany({
			where: { userId: user.id, kind: "tag", sourceNote: { deletedAt: null } },
			select: { targetLabel: true, sourceNoteId: true },
		}),
		prisma.noteTagMeta.findMany({
			where: { userId: user.id },
			select: { name: true, color: true },
		}),
		prisma.journalEntry.findMany({
			where: { userId: user.id, deletedAt: null },
			select: { id: true, tags: true },
		}),
	]);

	// Count notes and journal entries carrying each tag under one shared key set
	// so a tag used only in a journal still surfaces in the overview.
	const sourcesByTag = new Map<string, Set<string>>();
	for (const link of links) {
		const bucket = sourcesByTag.get(link.targetLabel) ?? new Set<string>();
		bucket.add(`note:${link.sourceNoteId}`);
		sourcesByTag.set(link.targetLabel, bucket);
	}
	for (const entry of journals) {
		for (const tag of entry.tags) {
			const bucket = sourcesByTag.get(tag) ?? new Set<string>();
			bucket.add(`journal:${entry.id}`);
			sourcesByTag.set(tag, bucket);
		}
	}

	const colorByName = new Map(meta.map((row) => [row.name, row.color]));
	const names = new Set([...sourcesByTag.keys(), ...colorByName.keys()]);

	return [...names]
		.map((name) => ({
			name,
			color: (colorByName.get(name) as NotePropertyColor | null | undefined) ?? null,
			noteCount: sourcesByTag.get(name)?.size ?? 0,
		}))
		.toSorted((left, right) =>
			right.noteCount !== left.noteCount
				? right.noteCount - left.noteCount
				: left.name.localeCompare(right.name),
		);
}

export async function setTagColor(name: string, color: NotePropertyColor | null): Promise<void> {
	const normalized = normalizeStoredTagEntry(name);
	if (!normalized) return;
	const { prisma, user } = await getAuthenticatedUser();

	if (color === null) {
		await prisma.noteTagMeta.deleteMany({ where: { userId: user.id, name: normalized } });
		return;
	}

	await prisma.noteTagMeta.upsert({
		where: { userId_name: { userId: user.id, name: normalized } },
		update: { color },
		create: { userId: user.id, name: normalized, color },
	});
}

export async function renameTag(from: string, to: string): Promise<ChipRewriteResult> {
	// The source is an existing persisted label (markdown tags may carry
	// underscores); the target must be valid for chips and markdown alike.
	const source = normalizeStoredTagEntry(from);
	const target = normalizeTagName(to);
	if (!source || !target || source === target) {
		return { rewrittenNoteIds: [] };
	}

	const { prisma, user } = await getAuthenticatedUser();
	return prisma.$transaction(async (tx) => {
		const rewrittenNoteIds = await rewriteTagAcrossNotes(tx, user.id, source, target);
		await rewriteTagAcrossJournals(tx, user.id, source, target);

		const [sourceMeta, targetMeta] = await Promise.all([
			tx.noteTagMeta.findUnique({
				where: { userId_name: { userId: user.id, name: source } },
			}),
			tx.noteTagMeta.findUnique({
				where: { userId_name: { userId: user.id, name: target } },
			}),
		]);
		if (sourceMeta) {
			await tx.noteTagMeta.delete({ where: { id: sourceMeta.id } });
			if (!targetMeta && sourceMeta.color) {
				await tx.noteTagMeta.create({
					data: { userId: user.id, name: target, color: sourceMeta.color },
				});
			}
		}

		return { rewrittenNoteIds };
	});
}

export async function deleteTag(name: string): Promise<ChipRewriteResult> {
	const normalized = normalizeStoredTagEntry(name);
	if (!normalized) return { rewrittenNoteIds: [] };

	const { prisma, user } = await getAuthenticatedUser();
	return prisma.$transaction(async (tx) => {
		const rewrittenNoteIds = await rewriteTagAcrossNotes(tx, user.id, normalized, null);
		await rewriteTagAcrossJournals(tx, user.id, normalized, null);
		// Rows on soft-deleted notes/journals are not resynced by the rewrite; drop
		// them so the tag cannot resurrect with a stale label from the trash.
		await Promise.all([
			tx.noteTagMeta.deleteMany({ where: { userId: user.id, name: normalized } }),
			tx.noteLink.deleteMany({
				where: { userId: user.id, kind: "tag", targetLabel: normalized },
			}),
			tx.journalLink.deleteMany({
				where: { userId: user.id, kind: "tag", targetLabel: normalized },
			}),
		]);
		return { rewrittenNoteIds };
	});
}

export async function listTagNotes(name: string): Promise<TaggedNoteSummary[]> {
	const normalized = normalizeStoredTagEntry(name);
	if (!normalized) return [];

	const { prisma, user } = await getAuthenticatedUser();
	const [noteRecords, journalRecords] = await Promise.all([
		listTaggedNoteRecords(prisma, user.id, normalized),
		listTaggedJournalRecords(prisma, user.id, normalized),
	]);
	return [
		...noteRecords.map((record) => ({
			id: record.id,
			name: record.name,
			modifiedAt: record.updatedAt,
			kind: "note" as const,
		})),
		...journalRecords.map((record) => ({
			id: record.id,
			name: record.title?.trim() || record.dateKey,
			modifiedAt: record.updatedAt,
			kind: "journal" as const,
			dateKey: record.dateKey,
		})),
	].toSorted((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime());
}
