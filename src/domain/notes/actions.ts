"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { Prisma } from "@/generated/prisma/client";
import {
	fromPersistedNote,
	fromPersistedNoteVersion,
} from "@/domain/notes/mappers";
import type {
	NoteFile,
	NoteVersion,
	NoteVersionReason,
	RichTextDocument,
} from "@/domain/notes/models";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import {
	buildNoteVersionContentHash,
	shouldPersistNoteVersion,
} from "@/domain/notes/versioning";
import { getNote } from "@/domain/notes/queries";
import type {
	FolderId,
	IsoTime,
	MarkdownContent,
	NoteId,
	TagName,
} from "@/domain/persistence/types";

type NoteRecord = {
	id: string;
	name: string;
	content: string;
	richContent: Prisma.JsonValue | null;
	preferredEditorMode: string | null;
	parentId: string | null;
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
		(record.richContent as RichTextDocument | null) ??
		markdownToRichDocument(record.content);
	const meta = record.journalMeta as
		| {
				mood?: import("@/domain/journal/models").MoodLevel;
				tags: string[];
				weather?: string;
				location?: string;
		  }
		| null;
	return fromPersistedNote({
		id: record.id as NoteId,
		name: record.name,
		content: record.content as MarkdownContent,
		richContent,
		preferredEditorMode: (record.preferredEditorMode as "raw" | "block" | null) ?? "block",
		parentId: record.parentId as FolderId | null,
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
	userId: string,
	noteId: string,
	note: Pick<NoteFile, "name" | "content" | "richContent" | "preferredEditorMode" | "parentId" | "tags">,
	reason: NoteVersionReason,
): Promise<boolean> {
	const { prisma } = await getAuthenticatedUser();

	const latest = await prisma.noteVersion.findFirst({
		where: { userId, noteId },
		orderBy: { createdAt: "desc" },
	});
	const latestVersion = latest ? recordToNoteVersion(latest) : null;

	const createdAt = new Date();
	const candidate = { ...note, reason, createdAt };
	if (!shouldPersistNoteVersion(candidate, latestVersion)) {
		return false;
	}

	await prisma.noteVersion.create({
		data: {
			userId,
			noteId,
			name: note.name,
			content: note.content,
			richContent: (note.richContent ?? markdownToRichDocument(note.content)) as Prisma.InputJsonValue,
			preferredEditorMode: note.preferredEditorMode ?? "block",
			parentId: note.parentId ?? null,
			tags: note.tags ?? [],
			reason,
			contentHash: buildNoteVersionContentHash(candidate),
			createdAt,
		},
	});

	return true;
}

export type CreateNoteInput = {
	id?: string;
	name: string;
	content: string;
	richContent?: RichTextDocument;
	preferredEditorMode?: "raw" | "block";
	parentId?: string | null;
	tags?: string[];
};

export async function createNote(input: CreateNoteInput): Promise<NoteFile> {
	const { prisma, user } = await getAuthenticatedUser();
	const id = input.id ?? crypto.randomUUID();
	const name = input.name.endsWith(".md") ? input.name : `${input.name}.md`;
	const richContent = (input.richContent ?? markdownToRichDocument(input.content)) as Prisma.InputJsonValue;

	const record = await prisma.note.upsert({
		where: { id },
		create: {
			id,
			userId: user.id,
			name,
			content: input.content,
			richContent,
			preferredEditorMode: input.preferredEditorMode ?? "block",
			parentId: input.parentId ?? null,
			tags: input.tags ?? [],
		},
		update: {
			name,
			content: input.content,
			richContent,
			preferredEditorMode: input.preferredEditorMode ?? "block",
			parentId: input.parentId ?? null,
			tags: input.tags ?? [],
		},
	});

	const note = recordToNoteFile(record);
	await insertNoteVersion(
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
}

export type UpdateNoteInput = {
	id: string;
	name?: string;
	content?: string;
	richContent?: RichTextDocument;
	preferredEditorMode?: "raw" | "block";
	parentId?: string | null;
	tags?: string[];
	createCheckpoint?: boolean;
};

export type UpdateNoteResult = {
	note?: NoteFile;
	versionCreated: boolean;
};

export async function updateNote(input: UpdateNoteInput): Promise<UpdateNoteResult> {
	const { prisma, user } = await getAuthenticatedUser();

	const patch: Prisma.NoteUncheckedUpdateManyInput = {};
	if (input.name !== undefined) {
		patch.name = input.name.endsWith(".md") ? input.name : `${input.name}.md`;
	}
	if (input.content !== undefined) {
		patch.content = input.content;
		patch.richContent = (input.richContent ?? markdownToRichDocument(input.content)) as Prisma.InputJsonValue;
	} else if (input.richContent !== undefined) {
		patch.richContent = input.richContent as Prisma.InputJsonValue;
	}
	if (input.preferredEditorMode !== undefined) {
		patch.preferredEditorMode = input.preferredEditorMode;
	}
	if (input.parentId !== undefined) {
		patch.parentId = input.parentId;
	}
	if (input.tags !== undefined) {
		patch.tags = input.tags;
	}

	const { count } = await prisma.note.updateMany({
		where: { id: input.id, userId: user.id, deletedAt: null },
		data: patch,
	});
	if (count === 0) return { versionCreated: false };

	const record = await prisma.note.findFirst({
		where: { id: input.id, userId: user.id, deletedAt: null },
	});
	if (!record) return { versionCreated: false };

	const updatedNote = recordToNoteFile(record);
	const shouldCreateVersion = input.name !== undefined || input.createCheckpoint === true;
	const versionReason: NoteVersionReason = input.name !== undefined ? "rename" : "autosave";
	const versionCreated = shouldCreateVersion
		? await insertNoteVersion(
				user.id,
				input.id,
				{
					name: updatedNote.name,
					content: updatedNote.content,
					richContent: updatedNote.richContent,
					preferredEditorMode: updatedNote.preferredEditorMode,
					parentId: updatedNote.parentId,
					tags: updatedNote.tags ?? [],
				},
				versionReason,
			)
		: false;

	return { note: updatedNote, versionCreated };
}

export async function restoreNoteVersion(versionId: string): Promise<UpdateNoteResult> {
	const { prisma, user } = await getAuthenticatedUser();

	const versionRecord = await prisma.noteVersion.findFirst({
		where: { id: versionId, userId: user.id },
	});
	if (!versionRecord) return { versionCreated: false };

	const version = recordToNoteVersion(versionRecord);
	const current = await getNote(version.noteId);
	if (!current) return { versionCreated: false };

	await insertNoteVersion(
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

	const { count } = await prisma.note.updateMany({
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

	const updated = await prisma.note.findFirst({
		where: { id: version.noteId, userId: user.id },
	});
	return {
		note: updated ? recordToNoteFile(updated) : undefined,
		versionCreated: true,
	};
}

export async function deleteNote(id: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.note.updateMany({
		where: { id, userId: user.id, deletedAt: null },
		data: { deletedAt: new Date() },
	});
}
