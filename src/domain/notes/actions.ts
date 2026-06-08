"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { assertOwnedParentFolder, assertResourceIdAvailable } from "@/domain/persistence/guards";
import {
	createNoteInputSchema,
	parseServerInput,
	updateNoteInputSchema,
} from "@/domain/validation/schemas";
import { fromPersistedNote, fromPersistedNoteVersion } from "@/domain/notes/mappers";
import type {
	NoteFile,
	NoteVersion,
	NoteVersionReason,
	RichTextDocument,
} from "@/domain/notes/models";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { buildNoteVersionContentHash, shouldPersistNoteVersion } from "@/domain/notes/versioning";
import { getNote, listNoteVersions } from "@/domain/notes/queries";
import { listNoteBacklinks } from "@/features/notes/server/backlinks-queries";
import {
	extractNoteLinks,
	extractNoteTags,
	getNoteSearchableContent,
	normalizeNoteTitle,
	type ResolvedNoteLink,
} from "@/domain/notes/note-links";
import { buildGraphData, type GraphData } from "@/domain/notes/graph";
import type {
	FolderId,
	IsoTime,
	MarkdownContent,
	NoteId,
	TagName,
} from "@/domain/persistence/types";

type NoteDb = Pick<PrismaClient, "note" | "noteVersion" | "noteLink" | "folder" | "journalEntry">;

type NoteRecord = {
	id: string;
	name: string;
	content: string;
	richContent: Prisma.JsonValue | null;
	preferredEditorMode: string | null;
	parentId: string | null;
	sortOrder: number;
	tags: string[];
	journalMeta: Prisma.JsonValue | null;
	createdAt: Date;
	updatedAt: Date;
};

type NoteVersionRecord = {
	id: string;
	noteId: string;
	name: string;
	content: string;
	richContent: Prisma.JsonValue | null;
	preferredEditorMode: string;
	parentId: string | null;
	tags: string[];
	reason: string;
	contentHash: string;
	createdAt: Date;
};

function recordToNoteFile(record: NoteRecord): NoteFile {
	const richContent =
		(record.richContent as RichTextDocument | null) ?? markdownToRichDocument(record.content);
	const meta = record.journalMeta as {
		mood?: import("@/domain/journal/models").MoodLevel;
		tags: string[];
		weather?: string;
		location?: string;
	} | null;
	return fromPersistedNote({
		id: record.id as NoteId,
		name: record.name,
		content: record.content as MarkdownContent,
		richContent,
		preferredEditorMode: (record.preferredEditorMode as "raw" | "block" | null) ?? "block",
		parentId: record.parentId as FolderId | null,
		sortOrder: record.sortOrder,
		tags: record.tags.map((tag) => tag as TagName),
		journalMeta: meta
			? {
					...meta,
					tags: meta.tags.map((tag) => tag as TagName),
				}
			: undefined,
		createdAt: record.createdAt.toISOString() as IsoTime,
		updatedAt: record.updatedAt.toISOString() as IsoTime,
	});
}

function recordToNoteVersion(record: NoteVersionRecord): NoteVersion {
	return fromPersistedNoteVersion({
		id: record.id,
		note_id: record.noteId,
		name: record.name,
		content: record.content,
		rich_content: record.richContent as RichTextDocument | null,
		preferred_editor_mode: record.preferredEditorMode as "raw" | "block",
		parent_id: record.parentId,
		tags: record.tags,
		reason: record.reason as NoteVersionReason,
		content_hash: record.contentHash,
		created_at: record.createdAt.toISOString(),
	});
}

async function insertNoteVersion(
	db: Pick<NoteDb, "noteVersion">,
	userId: string,
	noteId: string,
	note: Pick<
		NoteFile,
		"name" | "content" | "richContent" | "preferredEditorMode" | "parentId" | "tags"
	>,
	reason: NoteVersionReason,
): Promise<string | null> {
	const latest = await db.noteVersion.findFirst({
		where: { userId, noteId },
		orderBy: { createdAt: "desc" },
	});
	const latestVersion = latest ? recordToNoteVersion(latest) : null;

	const createdAt = new Date();
	const candidate = { ...note, reason, createdAt };
	if (!shouldPersistNoteVersion(candidate, latestVersion)) {
		return null;
	}

	const created = await db.noteVersion.create({
		data: {
			userId,
			noteId,
			name: note.name,
			content: note.content,
			richContent: (note.richContent ??
				markdownToRichDocument(note.content)) as Prisma.InputJsonValue,
			preferredEditorMode: note.preferredEditorMode ?? "block",
			parentId: note.parentId ?? null,
			tags: note.tags ?? [],
			reason,
			contentHash: buildNoteVersionContentHash(candidate),
			createdAt,
		},
	});

	return created.id;
}

// Rewrites the persisted note_links edges for a note (delete-and-replace) from
// its current content. One row per distinct outgoing link or tag membership.
// Reuses the same parsers the editor/backlinks use so the graph stays in sync.
async function syncNoteLinks(
	db: Pick<NoteDb, "noteLink">,
	userId: string,
	note: Pick<NoteFile, "id" | "content" | "richContent" | "tags">,
): Promise<void> {
	const rows = new Map<string, Prisma.NoteLinkCreateManyInput>();

	for (const link of extractNoteLinks(note)) {
		const targetLabel = normalizeNoteTitle(link.targetLabel);
		if (!targetLabel) continue;
		rows.set(`${link.kind}:${targetLabel}`, {
			userId,
			sourceNoteId: note.id,
			targetNoteId: link.targetNoteId ?? null,
			targetLabel,
			kind: link.kind,
		});
	}

	const tagNames = new Set<string>([
		...extractNoteTags(getNoteSearchableContent(note)),
		...(note.tags ?? []).map((tag) => tag.trim().replace(/^#/, "").toLowerCase()),
	]);
	for (const tag of tagNames) {
		if (!tag) continue;
		rows.set(`tag:${tag}`, {
			userId,
			sourceNoteId: note.id,
			targetNoteId: null,
			targetLabel: tag,
			kind: "tag",
		});
	}

	await db.noteLink.deleteMany({ where: { userId, sourceNoteId: note.id } });
	if (rows.size > 0) {
		await db.noteLink.createMany({ data: [...rows.values()] });
	}
}

async function updateExistingNoteVersion(
	db: Pick<NoteDb, "noteVersion">,
	userId: string,
	versionId: string,
	noteId: string,
	note: Pick<
		NoteFile,
		"name" | "content" | "richContent" | "preferredEditorMode" | "parentId" | "tags"
	>,
	reason: NoteVersionReason,
): Promise<boolean> {
	const existing = await db.noteVersion.findFirst({
		where: { id: versionId, userId, noteId },
	});
	if (!existing) {
		return false;
	}

	const candidate = { ...note, reason, createdAt: existing.createdAt };
	const nextHash = buildNoteVersionContentHash(candidate);
	if (nextHash === existing.contentHash) {
		return false;
	}

	const { count } = await db.noteVersion.updateMany({
		where: { id: versionId, userId, noteId },
		data: {
			name: note.name,
			content: note.content,
			richContent: (note.richContent ??
				markdownToRichDocument(note.content)) as Prisma.InputJsonValue,
			preferredEditorMode: note.preferredEditorMode ?? "block",
			parentId: note.parentId ?? null,
			tags: note.tags ?? [],
			contentHash: nextHash,
		},
	});

	return count > 0;
}

export type CreateNoteInput = {
	id?: string;
	name: string;
	content: string;
	richContent?: RichTextDocument;
	preferredEditorMode?: "raw" | "block";
	parentId?: string | null;
	sortOrder?: number;
	tags?: string[];
};

export async function createNote(input: CreateNoteInput): Promise<NoteFile> {
	const validated = parseServerInput(createNoteInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();
	const id = validated.id ?? crypto.randomUUID();
	const name = validated.name.endsWith(".md") ? validated.name : `${validated.name}.md`;
	const richContent = (validated.richContent ??
		markdownToRichDocument(validated.content)) as Prisma.InputJsonValue;
	const parentId = validated.parentId ?? null;
	await assertOwnedParentFolder(prisma, user.id, parentId);
	const [lastNote, lastFolder] = await Promise.all([
		prisma.note.aggregate({
			where: { userId: user.id, deletedAt: null, parentId },
			_max: { sortOrder: true },
		}),
		prisma.folder.aggregate({
			where: { userId: user.id, deletedAt: null, parentId },
			_max: { sortOrder: true },
		}),
	]);
	const sortOrder =
		validated.sortOrder ??
		Math.max(lastNote._max.sortOrder ?? -1, lastFolder._max.sortOrder ?? -1) + 1;

	return prisma.$transaction(async (tx) => {
		const noteData = {
			name,
			content: validated.content,
			richContent,
			preferredEditorMode: validated.preferredEditorMode ?? "block",
			parentId,
			sortOrder,
			tags: validated.tags ?? [],
		};
		const noteSelect = {
			id: true,
			name: true,
			content: true,
			richContent: true,
			preferredEditorMode: true,
			parentId: true,
			sortOrder: true,
			tags: true,
			journalMeta: true,
			createdAt: true,
			updatedAt: true,
		} as const;

		const { count } = await tx.note.updateMany({
			where: { id, userId: user.id, deletedAt: null },
			data: noteData,
		});

		let record: NoteRecord;
		if (count > 0) {
			const updated = await tx.note.findFirst({
				where: { id, userId: user.id, deletedAt: null },
				select: noteSelect,
			});
			if (!updated) throw new Error("Failed to load updated note");
			record = updated;
		} else {
			await assertResourceIdAvailable(tx, "note", id, user.id);
			record = await tx.note.create({
				data: {
					id,
					userId: user.id,
					...noteData,
				},
				select: noteSelect,
			});
		}

		const note = recordToNoteFile(record);
		await syncNoteLinks(tx, user.id, note);
		await insertNoteVersion(
			tx,
			user.id,
			id,
			{
				name: note.name,
				content: note.content,
				richContent: note.richContent,
				preferredEditorMode: note.preferredEditorMode,
				parentId: note.parentId,
				tags: note.tags ?? [],
			},
			"created",
		);

		return note;
	});
}

export type UpdateNoteInput = {
	id: string;
	name?: string;
	content?: string;
	richContent?: RichTextDocument;
	preferredEditorMode?: "raw" | "block";
	parentId?: string | null;
	sortOrder?: number;
	tags?: string[];
	createCheckpoint?: boolean;
	sessionVersionId?: string | null;
};

export type UpdateNoteResult = {
	note?: NoteFile;
	versionCreated: boolean;
	versionChanged?: boolean;
	versionId?: string | null;
};

export async function updateNote(input: UpdateNoteInput): Promise<UpdateNoteResult> {
	const validated = parseServerInput(updateNoteInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();
	if (validated.parentId !== undefined) {
		await assertOwnedParentFolder(prisma, user.id, validated.parentId);
	}

	const patch: Prisma.NoteUncheckedUpdateManyInput = {};
	if (validated.name !== undefined) {
		patch.name = validated.name.endsWith(".md") ? validated.name : `${validated.name}.md`;
	}
	if (validated.content !== undefined) {
		patch.content = validated.content;
		patch.richContent = (validated.richContent ??
			markdownToRichDocument(validated.content)) as Prisma.InputJsonValue;
	} else if (validated.richContent !== undefined) {
		patch.richContent = validated.richContent as Prisma.InputJsonValue;
	}
	if (validated.preferredEditorMode !== undefined) {
		patch.preferredEditorMode = validated.preferredEditorMode;
	}
	if (validated.parentId !== undefined) {
		patch.parentId = validated.parentId;
	}
	if (validated.sortOrder !== undefined) {
		patch.sortOrder = validated.sortOrder;
	}
	if (validated.tags !== undefined) {
		patch.tags = validated.tags;
	}

	return prisma.$transaction(async (tx) => {
		const { count } = await tx.note.updateMany({
			where: { id: validated.id, userId: user.id, deletedAt: null },
			data: patch,
		});
		if (count === 0) return { versionCreated: false };

		const record = await tx.note.findFirst({
			where: { id: validated.id, userId: user.id, deletedAt: null },
		});
		if (!record) return { versionCreated: false };

		const updatedNote = recordToNoteFile(record);
		if (validated.content !== undefined || validated.richContent !== undefined) {
			await syncNoteLinks(tx, user.id, updatedNote);
		}
		const versionReason: NoteVersionReason =
			validated.name !== undefined
				? "rename"
				: validated.createCheckpoint
					? "checkpoint"
					: "autosave";
		const noteSnapshot = {
			name: updatedNote.name,
			content: updatedNote.content,
			richContent: updatedNote.richContent,
			preferredEditorMode: updatedNote.preferredEditorMode,
			parentId: updatedNote.parentId,
			tags: updatedNote.tags ?? [],
		};

		if (validated.sessionVersionId && validated.createCheckpoint) {
			const versionChanged = await updateExistingNoteVersion(
				tx,
				user.id,
				validated.sessionVersionId,
				validated.id,
				noteSnapshot,
				versionReason,
			);
			if (versionChanged) {
				return {
					note: updatedNote,
					versionCreated: false,
					versionChanged: true,
					versionId: validated.sessionVersionId,
				};
			}
		}

		const shouldCreateVersion =
			validated.name !== undefined || validated.createCheckpoint === true;
		const versionId = shouldCreateVersion
			? await insertNoteVersion(tx, user.id, validated.id, noteSnapshot, versionReason)
			: null;
		const versionCreated = versionId !== null;

		return {
			note: updatedNote,
			versionCreated,
			versionChanged: versionCreated,
			versionId,
		};
	});
}

export async function restoreNoteVersion(versionId: string): Promise<UpdateNoteResult> {
	const { prisma, user } = await getAuthenticatedUser();

	return prisma.$transaction(async (tx) => {
		const versionRecord = await tx.noteVersion.findFirst({
			where: { id: versionId, userId: user.id },
		});
		if (!versionRecord) return { versionCreated: false };

		const version = recordToNoteVersion(versionRecord);
		const currentRecord = await tx.note.findFirst({
			where: { id: version.noteId, userId: user.id, deletedAt: null },
		});
		if (!currentRecord) return { versionCreated: false };

		const current = recordToNoteFile(currentRecord);

		await insertNoteVersion(
			tx,
			user.id,
			current.id,
			{
				name: current.name,
				content: current.content,
				richContent: current.richContent,
				preferredEditorMode: current.preferredEditorMode,
				parentId: current.parentId,
				tags: current.tags ?? [],
			},
			"restore",
		);

		const { count } = await tx.note.updateMany({
			where: { id: version.noteId, userId: user.id, deletedAt: null },
			data: {
				name: version.name,
				content: version.content,
				richContent: version.richContent as Prisma.InputJsonValue,
				preferredEditorMode: version.preferredEditorMode,
				parentId: version.parentId,
				tags: version.tags ?? [],
			},
		});
		if (count === 0) return { versionCreated: true };

		const updated = await tx.note.findFirst({
			where: { id: version.noteId, userId: user.id },
		});
		return {
			note: updated ? recordToNoteFile(updated) : undefined,
			versionCreated: true,
		};
	});
}

export async function deleteNote(id: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.note.updateMany({
		where: { id, userId: user.id, deletedAt: null },
		data: { deletedAt: new Date() },
	});
}

export async function fetchNote(id: string): Promise<NoteFile | null> {
	return getNote(id);
}

export async function fetchNoteBacklinks(id: string): Promise<ResolvedNoteLink[]> {
	return listNoteBacklinks(id);
}

export async function fetchNoteVersions(id: string): Promise<NoteVersion[]> {
	return listNoteVersions(id);
}

// Builds the whole-workspace knowledge graph (notes + tags as nodes, persisted
// note_links as edges) plus connectivity/cluster metrics for the graph view.
export async function fetchNoteGraph(): Promise<GraphData> {
	const { prisma, user } = await getAuthenticatedUser();

	const [notes, links] = await Promise.all([
		prisma.note.findMany({
			where: { userId: user.id, deletedAt: null },
			select: { id: true, name: true },
		}),
		prisma.noteLink.findMany({
			where: { userId: user.id },
			select: { sourceNoteId: true, targetNoteId: true, targetLabel: true, kind: true },
		}),
	]);

	return buildGraphData(notes, links);
}
