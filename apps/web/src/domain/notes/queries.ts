import { getAuthenticatedUser } from "@/core/db";
import type { Prisma } from "@/generated/prisma/client";
import { isGuestScopedId } from "@/domain/notes/note-id";
import { resolveNoteAccess, resolveReadableNote } from "@/domain/notes/note-access";
import { fromPersistedNote, fromPersistedNoteVersion } from "@/domain/notes/mappers";
import type {
	NoteAccessRole,
	NoteFile,
	NoteVersion,
	NoteVersionReason,
	RichTextDocument,
} from "@/domain/notes/models";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { normalizeNoteProperties } from "@/domain/notes/properties";
import { NOTE_VERSION_RETENTION_LIMIT } from "@/domain/notes/versioning";
import type { FolderId, IsoTime, MarkdownContent, NoteId, TagName } from "@/core/persistence/types";

type NoteRecord = {
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

type NoteMetadataRecord = Omit<
	NoteRecord,
	"content" | "richContent" | "properties" | "journalMeta" | "cover"
>;

type NoteVersionRecord = {
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

function recordToNoteFile(
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

function recordToNoteMetadata(record: NoteMetadataRecord): NoteFile {
	return fromPersistedNote({
		id: record.id as NoteId,
		name: record.name,
		content: "" as MarkdownContent,
		richContent: [],
		preferredEditorMode: (record.preferredEditorMode as "raw" | "block" | null) ?? "block",
		parentId: record.parentId as FolderId | null,
		sortOrder: record.sortOrder,
		tags: record.tags.map((tag) => tag as TagName),
		properties: [],
		icon: record.icon ?? undefined,
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
		properties: normalizeNoteProperties(record.properties),
		reason: record.reason as NoteVersionReason,
		content_hash: record.contentHash,
		created_at: record.createdAt.toISOString(),
	});
}

export async function listNoteMetadata(): Promise<NoteFile[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.note.findMany({
		where: { userId: user.id, deletedAt: null },
		orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
		select: {
			id: true,
			name: true,
			preferredEditorMode: true,
			parentId: true,
			sortOrder: true,
			tags: true,
			icon: true,
			createdAt: true,
			updatedAt: true,
		},
	});
	return records.map(recordToNoteMetadata);
}

export async function listNoteVersions(
	noteId: string,
	limit = NOTE_VERSION_RETENTION_LIMIT,
): Promise<NoteVersion[]> {
	if (isGuestScopedId(noteId)) return [];
	const { prisma, user } = await getAuthenticatedUser();
	// Versions are bookkept under the owner, so read under `ownerId` once the
	// caller is confirmed as owner or an accepted collaborator. This lets an
	// editor see (and the panel restore) the shared note's history.
	const access = await resolveNoteAccess(prisma, user.id, noteId);
	if (!access) return [];
	const records = await prisma.noteVersion.findMany({
		where: { userId: access.ownerId, noteId },
		orderBy: { createdAt: "desc" },
		take: limit,
	});
	return records.map(recordToNoteVersion);
}

export async function getNote(id: string): Promise<NoteFile | null> {
	if (isGuestScopedId(id)) return null;
	const { prisma, user } = await getAuthenticatedUser();
	// Single authorization gate: owner or accepted collaborator, with the row.
	const resolved = await resolveReadableNote(prisma, user.id, id);
	if (!resolved) return null;
	return recordToNoteFile(resolved.record, {
		ownerId: resolved.ownerId,
		role: resolved.role,
	});
}
