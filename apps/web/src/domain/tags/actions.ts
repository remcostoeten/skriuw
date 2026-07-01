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
import type { NotePropertyColor } from "@/domain/notes/properties";
import { normalizeStoredTagEntry, normalizeTagName } from "@/domain/tags/normalize";

type TagDb = Pick<PrismaClient, "note" | "noteLink" | "noteTagMeta">;

async function listTaggedNoteRecords(tx: TagDb, userId: string, name: string) {
	const links = await tx.noteLink.findMany({
		where: { userId, kind: "tag", targetLabel: name, sourceNote: { deletedAt: null } },
		select: { sourceNoteId: true },
	});
	const ids = [...new Set(links.map((link) => link.sourceNoteId))];
	if (ids.length === 0) return [];
	return tx.note.findMany({
		where: { id: { in: ids }, userId, deletedAt: null },
		select: { id: true, name: true, content: true, richContent: true, tags: true, updatedAt: true },
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

	for (const record of records) {
		const patch = rewriteNoteForTag(
			{
				content: record.content,
				richContent: (record.richContent as RichTextDocument | null) ?? [],
				tags: record.tags,
			},
			from,
			to,
		);
		if (!patch) continue;

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
		rewritten.push(record.id);
	}

	return rewritten;
}

export async function listTags(): Promise<TagSummary[]> {
	const { prisma, user } = await getAuthenticatedUser();

	const [links, meta] = await Promise.all([
		prisma.noteLink.findMany({
			where: { userId: user.id, kind: "tag", sourceNote: { deletedAt: null } },
			select: { targetLabel: true, sourceNoteId: true },
		}),
		prisma.noteTagMeta.findMany({
			where: { userId: user.id },
			select: { name: true, color: true },
		}),
	]);

	const notesByTag = new Map<string, Set<string>>();
	for (const link of links) {
		const bucket = notesByTag.get(link.targetLabel) ?? new Set<string>();
		bucket.add(link.sourceNoteId);
		notesByTag.set(link.targetLabel, bucket);
	}

	const colorByName = new Map(meta.map((row) => [row.name, row.color]));
	const names = new Set([...notesByTag.keys(), ...colorByName.keys()]);

	return [...names]
		.map((name) => ({
			name,
			color: (colorByName.get(name) as NotePropertyColor | null | undefined) ?? null,
			noteCount: notesByTag.get(name)?.size ?? 0,
		}))
		.toSorted((left, right) =>
			right.noteCount !== left.noteCount
				? right.noteCount - left.noteCount
				: left.name.localeCompare(right.name),
		);
}

export async function setTagColor(
	name: string,
	color: NotePropertyColor | null,
): Promise<void> {
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

		const [sourceMeta, targetMeta] = await Promise.all([
			tx.noteTagMeta.findUnique({ where: { userId_name: { userId: user.id, name: source } } }),
			tx.noteTagMeta.findUnique({ where: { userId_name: { userId: user.id, name: target } } }),
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
		await tx.noteTagMeta.deleteMany({ where: { userId: user.id, name: normalized } });
		// Rows on soft-deleted notes are not resynced by the rewrite; drop them so
		// the tag cannot resurrect with a stale label from the trash.
		await tx.noteLink.deleteMany({
			where: { userId: user.id, kind: "tag", targetLabel: normalized },
		});
		return { rewrittenNoteIds };
	});
}

export async function listTagNotes(name: string): Promise<TaggedNoteSummary[]> {
	const normalized = normalizeStoredTagEntry(name);
	if (!normalized) return [];

	const { prisma, user } = await getAuthenticatedUser();
	const records = await listTaggedNoteRecords(prisma, user.id, normalized);
	return records
		.map((record) => ({ id: record.id, name: record.name, modifiedAt: record.updatedAt }))
		.toSorted((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime());
}
