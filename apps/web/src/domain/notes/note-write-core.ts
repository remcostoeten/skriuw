import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
	assertOwnedParentFolder,
	assertResourceIdAvailable,
	isRecordNotFoundError,
} from "@/domain/persistence/guards";
import { createNoteInputSchema, parseServerInput } from "@/domain/validation/schemas";
import { fromPersistedNote, fromPersistedNoteVersion } from "@/domain/notes/mappers";
import type {
	NoteAccessRole,
	NoteFile,
	NoteVersion,
	NoteVersionReason,
	RichTextDocument,
} from "@/domain/notes/models";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { normalizeNoteProperties, type NoteProperty } from "@/domain/notes/properties";
import {
	buildNoteVersionContentHash,
	decideNoteVersionPersistence,
	NOTE_VERSION_RETENTION_LIMIT,
} from "@/domain/notes/versioning";
import { syncNoteLinks } from "@/domain/notes/note-link-sync";
import type {
	FolderId,
	IsoTime,
	MarkdownContent,
	NoteId,
	TagName,
} from "@/domain/persistence/types";

export type NoteDb = Pick<
	PrismaClient,
	"note" | "noteVersion" | "noteLink" | "folder" | "journalEntry"
>;

export type NoteRecord = {
	id: string;
	name: string;
	content: string;
	richContent: Prisma.JsonValue | null;
	preferredEditorMode: string | null;
	parentId: string | null;
	sortOrder: number;
	tags: string[];
	properties: Prisma.JsonValue | null;
	icon: string | null;
	cover: string | null;
	journalMeta: Prisma.JsonValue | null;
	createdAt: Date;
	updatedAt: Date;
};

export type NoteVersionRecord = {
	id: string;
	noteId: string;
	name: string;
	content: string;
	richContent: Prisma.JsonValue | null;
	preferredEditorMode: string;
	parentId: string | null;
	tags: string[];
	properties: Prisma.JsonValue | null;
	reason: string;
	contentHash: string;
	createdAt: Date;
};

export const noteSelect = {
	id: true,
	name: true,
	content: true,
	richContent: true,
	preferredEditorMode: true,
	parentId: true,
	sortOrder: true,
	tags: true,
	properties: true,
	icon: true,
	cover: true,
	journalMeta: true,
	createdAt: true,
	updatedAt: true,
} as const;

export function recordToNoteFile(
	record: NoteRecord,
	access?: { ownerId: string; role: NoteAccessRole },
): NoteFile {
	const richContent =
		(record.richContent as RichTextDocument | null) ?? markdownToRichDocument(record.content);
	const meta = record.journalMeta as {
		mood?: import("@/domain/journal/models").MoodLevel;
		tags: string[];
		weather?: string;
		location?: string;
	} | null;
	const file = fromPersistedNote({
		id: record.id as NoteId,
		name: record.name,
		content: record.content as MarkdownContent,
		richContent,
		preferredEditorMode: (record.preferredEditorMode as "raw" | "block" | null) ?? "block",
		parentId: record.parentId as FolderId | null,
		sortOrder: record.sortOrder,
		tags: record.tags.map((tag) => tag as TagName),
		properties: normalizeNoteProperties(record.properties),
		icon: record.icon ?? undefined,
		cover: record.cover ?? undefined,
		journalMeta: meta
			? {
					...meta,
					tags: meta.tags.map((tag) => tag as TagName),
				}
			: undefined,
		createdAt: record.createdAt.toISOString() as IsoTime,
		updatedAt: record.updatedAt.toISOString() as IsoTime,
	});
	return access ? { ...file, ownerId: access.ownerId, access: access.role } : file;
}

export function recordToNoteVersion(record: NoteVersionRecord): NoteVersion {
	return fromPersistedNoteVersion({
		id: record.id,
		note_id: record.noteId,
		name: record.name,
		content: record.content,
		rich_content: record.richContent as RichTextDocument | null,
		preferred_editor_mode: record.preferredEditorMode as "raw" | "block",
		parent_id: record.parentId,
		tags: record.tags,
		properties: normalizeNoteProperties(record.properties),
		reason: record.reason as NoteVersionReason,
		content_hash: record.contentHash,
		created_at: record.createdAt.toISOString(),
	});
}

export async function insertNoteVersion(
	db: Pick<NoteDb, "noteVersion">,
	userId: string,
	noteId: string,
	note: Pick<
		NoteFile,
		| "name"
		| "content"
		| "richContent"
		| "preferredEditorMode"
		| "parentId"
		| "tags"
		| "properties"
	>,
	reason: NoteVersionReason,
): Promise<string | null> {
	// Lean select: the persist decision only needs hash, timestamp, content,
	// and reason — never the full richContent JSON snapshot.
	const latest = await db.noteVersion.findFirst({
		where: { userId, noteId },
		orderBy: { createdAt: "desc" },
		select: { id: true, contentHash: true, createdAt: true, content: true, reason: true },
	});

	const createdAt = new Date();
	const candidate = { ...note, reason, createdAt };
	const decision = decideNoteVersionPersistence(candidate, latest);
	if (decision.action === "skip") {
		return null;
	}
	if (decision.action === "coalesce") {
		const changed = await updateExistingNoteVersion(
			db,
			userId,
			decision.versionId,
			noteId,
			note,
			reason,
		);
		return changed ? decision.versionId : null;
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
			properties: normalizeNoteProperties(note.properties) as Prisma.InputJsonValue,
			reason,
			contentHash: buildNoteVersionContentHash(candidate),
			createdAt,
		},
	});

	await pruneNoteVersions(db, userId, noteId);

	return created.id;
}

async function pruneNoteVersions(
	db: Pick<NoteDb, "noteVersion">,
	userId: string,
	noteId: string,
): Promise<void> {
	const stale = await db.noteVersion.findMany({
		where: { userId, noteId },
		orderBy: { createdAt: "desc" },
		skip: NOTE_VERSION_RETENTION_LIMIT,
		select: { id: true },
	});
	if (stale.length > 0) {
		await db.noteVersion.deleteMany({
			where: { userId, noteId, id: { in: stale.map((row) => row.id) } },
		});
	}
}

async function updateExistingNoteVersion(
	db: Pick<NoteDb, "noteVersion">,
	userId: string,
	versionId: string,
	noteId: string,
	note: Pick<
		NoteFile,
		| "name"
		| "content"
		| "richContent"
		| "preferredEditorMode"
		| "parentId"
		| "tags"
		| "properties"
	>,
	reason: NoteVersionReason,
): Promise<boolean> {
	// The hash is independent of the stored row, so a single conditional
	// updateMany covers both "version missing" and "content unchanged".
	const nextHash = buildNoteVersionContentHash({ ...note, reason });
	const { count } = await db.noteVersion.updateMany({
		where: { id: versionId, userId, noteId, NOT: { contentHash: nextHash } },
		data: {
			name: note.name,
			content: note.content,
			richContent: (note.richContent ??
				markdownToRichDocument(note.content)) as Prisma.InputJsonValue,
			preferredEditorMode: note.preferredEditorMode ?? "block",
			parentId: note.parentId ?? null,
			tags: note.tags ?? [],
			properties: normalizeNoteProperties(note.properties) as Prisma.InputJsonValue,
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
	properties?: NoteProperty[];
	icon?: string;
	cover?: string;
};

/**
 * Persists a new note for an explicit owner. Callers are responsible for
 * resolving `userId` from a trusted source (session cookie or an authenticated
 * bearer token) — this function never derives identity itself, so it can serve
 * both the in-app server action and the cross-origin capture API.
 */
export async function createNoteForUser(
	prisma: PrismaClient,
	userId: string,
	input: CreateNoteInput,
): Promise<NoteFile> {
	const validated = parseServerInput(createNoteInputSchema, input);
	const id = validated.id ?? crypto.randomUUID();
	const name = validated.name.endsWith(".md") ? validated.name : `${validated.name}.md`;
	const richContent = (validated.richContent ??
		markdownToRichDocument(validated.content)) as Prisma.InputJsonValue;
	const parentId = validated.parentId ?? null;
	await assertOwnedParentFolder(prisma, userId, parentId);
	const [lastNote, lastFolder] = await Promise.all([
		prisma.note.aggregate({
			where: { userId, deletedAt: null, parentId },
			_max: { sortOrder: true },
		}),
		prisma.folder.aggregate({
			where: { userId, deletedAt: null, parentId },
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
			properties: normalizeNoteProperties(validated.properties) as Prisma.InputJsonValue,
			icon: validated.icon ?? null,
			cover: validated.cover ?? null,
		};

		let record: NoteRecord;
		try {
			record = await tx.note.update({
				where: { id, userId, deletedAt: null },
				data: noteData,
				select: noteSelect,
			});
		} catch (error) {
			if (!isRecordNotFoundError(error)) throw error;
			await assertResourceIdAvailable(tx, "note", id, userId);
			record = await tx.note.create({
				data: {
					id,
					userId,
					...noteData,
				},
				select: noteSelect,
			});
		}

		const note = recordToNoteFile(record);
		await syncNoteLinks(tx, userId, note);
		await insertNoteVersion(
			tx,
			userId,
			id,
			{
				name: note.name,
				content: note.content,
				richContent: note.richContent,
				preferredEditorMode: note.preferredEditorMode,
				parentId: note.parentId,
				tags: note.tags ?? [],
				properties: note.properties ?? [],
			},
			"created",
		);

		return note;
	});
}
