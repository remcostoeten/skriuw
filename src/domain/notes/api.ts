"use server";

import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { fromPersistedNote, fromPersistedNoteVersion } from "@/domain/notes/mappers";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { isMissingNotesTagsColumnError } from "@/domain/notes/schema-compat";
import {
	buildNoteVersionContentHash,
	shouldPersistNoteVersion,
} from "@/domain/notes/versioning";
import type {
	FolderId,
	IsoTime,
	MarkdownContent,
	NoteId,
	TagName,
} from "@/domain/persistence/types";
import type { NoteFile, NoteVersion, NoteVersionReason, RichTextDocument } from "@/domain/notes/models";
import type { MoodLevel } from "@/domain/journal/models";

type NoteRow = {
	id: string;
	name: string;
	content: string;
	rich_content: RichTextDocument | null;
	preferred_editor_mode: "raw" | "block" | null;
	parent_id: string | null;
	tags?: string[] | null;
	journal_meta: {
		mood?: MoodLevel;
		tags: string[];
		weather?: string;
		location?: string;
	} | null;
	created_at: string;
	updated_at: string;
};

type NoteMetadataRow = Omit<NoteRow, "content" | "rich_content" | "journal_meta">;
type NoteVersionRow = {
	id: string;
	note_id: string;
	name: string;
	content: string;
	rich_content: RichTextDocument | null;
	preferred_editor_mode: "raw" | "block" | null;
	parent_id: string | null;
	tags?: string[] | null;
	reason: NoteVersionReason;
	content_hash: string;
	created_at: string;
};

const NOTE_SELECT =
	"id, name, content, rich_content, preferred_editor_mode, parent_id, tags, journal_meta, created_at, updated_at";
const NOTE_SELECT_LEGACY =
	"id, name, content, rich_content, preferred_editor_mode, parent_id, journal_meta, created_at, updated_at";
const NOTE_METADATA_SELECT =
	"id, name, preferred_editor_mode, parent_id, tags, created_at, updated_at";
const NOTE_METADATA_SELECT_LEGACY =
	"id, name, preferred_editor_mode, parent_id, created_at, updated_at";
const NOTE_VERSION_SELECT =
	"id, note_id, name, content, rich_content, preferred_editor_mode, parent_id, tags, reason, content_hash, created_at";

type PostgrestLikeError = {
	code?: string | null;
	message?: string | null;
};

async function selectRowsWithOptionalTags<TRow>(
	run: (select: string) => Promise<{ data: unknown; error: PostgrestLikeError | null }>,
	selectWithTags: string,
	selectWithoutTags: string,
): Promise<TRow[]> {
	const result = await run(selectWithTags);
	if (!result.error) {
		return (result.data as TRow[] | null) ?? [];
	}
	if (!isMissingNotesTagsColumnError(result.error)) {
		throw result.error;
	}

	const fallback = await run(selectWithoutTags);
	if (fallback.error) {
		throw fallback.error;
	}

	return (fallback.data as TRow[] | null) ?? [];
}

async function selectMaybeSingleWithOptionalTags<TRow>(
	run: (select: string) => Promise<{ data: unknown; error: PostgrestLikeError | null }>,
	selectWithTags: string,
	selectWithoutTags: string,
): Promise<TRow | null> {
	const result = await run(selectWithTags);
	if (!result.error) {
		return (result.data as TRow | null) ?? null;
	}
	if (!isMissingNotesTagsColumnError(result.error)) {
		throw result.error;
	}

	const fallback = await run(selectWithoutTags);
	if (fallback.error) {
		throw fallback.error;
	}

	return (fallback.data as TRow | null) ?? null;
}

function rowToNoteFile(row: NoteRow): NoteFile {
	return fromPersistedNote({
		id: row.id as NoteId,
		name: row.name,
		content: row.content as MarkdownContent,
		richContent: row.rich_content ?? markdownToRichDocument(row.content),
		preferredEditorMode: row.preferred_editor_mode ?? "block",
		parentId: row.parent_id as FolderId | null,
		tags: row.tags?.map((tag) => tag as TagName),
		journalMeta: row.journal_meta
			? {
					...row.journal_meta,
					tags: row.journal_meta.tags.map((tag) => tag as TagName),
				}
			: undefined,
		createdAt: row.created_at as IsoTime,
		updatedAt: row.updated_at as IsoTime,
	});
}

function rowToNoteMetadataFile(row: NoteMetadataRow): NoteFile {
	return fromPersistedNote({
		id: row.id as NoteId,
		name: row.name,
		content: "" as MarkdownContent,
		richContent: [],
		preferredEditorMode: row.preferred_editor_mode ?? "block",
		parentId: row.parent_id as FolderId | null,
		tags: row.tags?.map((tag) => tag as TagName),
		createdAt: row.created_at as IsoTime,
		updatedAt: row.updated_at as IsoTime,
	});
}

function rowToNoteVersion(row: NoteVersionRow): NoteVersion {
	return fromPersistedNoteVersion({
		id: row.id,
		note_id: row.note_id,
		name: row.name,
		content: row.content,
		rich_content: row.rich_content,
		preferred_editor_mode: row.preferred_editor_mode,
		parent_id: row.parent_id,
		tags: row.tags,
		reason: row.reason,
		content_hash: row.content_hash,
		created_at: row.created_at,
	});
}

function buildVersionCandidate(
	note: Pick<NoteFile, "name" | "content" | "richContent" | "preferredEditorMode" | "parentId" | "tags">,
	reason: NoteVersionReason,
) {
	return {
		...note,
		reason,
	};
}

async function fetchLatestNoteVersion(
	supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
	userId: string,
	noteId: string,
): Promise<NoteVersion | null> {
	const { data, error } = await supabase
		.from("note_versions")
		.select(NOTE_VERSION_SELECT)
		.eq("user_id", userId)
		.eq("note_id", noteId)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) throw error;
	return data ? rowToNoteVersion(data as NoteVersionRow) : null;
}

async function insertNoteVersion(
	supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
	userId: string,
	noteId: string,
	note: Pick<NoteFile, "name" | "content" | "richContent" | "preferredEditorMode" | "parentId" | "tags">,
	reason: NoteVersionReason,
): Promise<boolean> {
	const latestVersion = await fetchLatestNoteVersion(supabase, userId, noteId);
	const createdAt = new Date();
	const candidate = { ...buildVersionCandidate(note, reason), createdAt };

	if (!shouldPersistNoteVersion(candidate, latestVersion)) {
		return false;
	}

	const row = {
		user_id: userId,
		note_id: noteId,
		name: note.name,
		content: note.content,
		rich_content: note.richContent ?? markdownToRichDocument(note.content),
		preferred_editor_mode: note.preferredEditorMode ?? "block",
		parent_id: note.parentId ?? null,
		tags: note.tags ?? [],
		reason,
		content_hash: buildNoteVersionContentHash(candidate),
		created_at: createdAt.toISOString(),
	};

	const { error } = await supabase.from("note_versions").insert([row]);
	if (error) throw error;

	return true;
}

export async function listNoteMetadata(): Promise<NoteFile[]> {
	const { supabase, user } = await getAuthenticatedUser();

	const data = await selectRowsWithOptionalTags<NoteMetadataRow>(
		async (select) =>
			await supabase
				.from("notes")
				.select(select)
				.eq("user_id", user.id)
				.is("deleted_at", null)
				.order("created_at", { ascending: true }),
		NOTE_METADATA_SELECT,
		NOTE_METADATA_SELECT_LEGACY,
	);

	return data.map((row: NoteMetadataRow) => rowToNoteMetadataFile(row));
}

export async function listNoteVersions(noteId: string, limit = 12): Promise<NoteVersion[]> {
	const { supabase, user } = await getAuthenticatedUser();

	const { data, error } = await supabase
		.from("note_versions")
		.select(NOTE_VERSION_SELECT)
		.eq("user_id", user.id)
		.eq("note_id", noteId)
		.order("created_at", { ascending: false })
		.limit(limit);

	if (error) throw error;

	return (data ?? []).map((row) => rowToNoteVersion(row as NoteVersionRow));
}

export async function listNotes(): Promise<NoteFile[]> {
	const { supabase, user } = await getAuthenticatedUser();

	const data = await selectRowsWithOptionalTags<NoteRow>(
		async (select) =>
			await supabase
				.from("notes")
				.select(select)
				.eq("user_id", user.id)
				.is("deleted_at", null)
				.order("created_at", { ascending: true }),
		NOTE_SELECT,
		NOTE_SELECT_LEGACY,
	);

	return data.map((row: NoteRow) => rowToNoteFile(row));
}

export async function getNote(id: string): Promise<NoteFile | null> {
	const { supabase, user } = await getAuthenticatedUser();

	const data = await selectMaybeSingleWithOptionalTags<NoteRow>(
		async (select) =>
			await supabase
				.from("notes")
				.select(select)
				.eq("user_id", user.id)
				.eq("id", id)
				.is("deleted_at", null)
				.maybeSingle(),
		NOTE_SELECT,
		NOTE_SELECT_LEGACY,
	);

	return data ? rowToNoteFile(data as NoteRow) : null;
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
	const { supabase, user } = await getAuthenticatedUser();
	const now = new Date().toISOString();
	const id = input.id ?? crypto.randomUUID();

	const row = {
		user_id: user.id,
		id,
		name: input.name.endsWith(".md") ? input.name : `${input.name}.md`,
		content: input.content,
		rich_content: input.richContent ?? markdownToRichDocument(input.content),
		preferred_editor_mode: input.preferredEditorMode ?? "block",
		parent_id: input.parentId ?? null,
		...(input.tags ? { tags: input.tags } : {}),
		journal_meta: null,
		created_at: now,
		updated_at: now,
	};

	const { error } = await supabase.from("notes").upsert([row], { onConflict: "user_id,id" });

	if (error) throw error;

	await insertNoteVersion(
		supabase,
		user.id,
		id,
		{
			name: row.name,
			content: row.content,
			richContent: row.rich_content,
			preferredEditorMode: row.preferred_editor_mode,
			parentId: row.parent_id,
			tags: row.tags ?? [],
		},
		"created",
	);

	return rowToNoteFile(row as NoteRow);
}

export type UpdateNoteInput = {
	id: string;
	name?: string;
	content?: string;
	richContent?: RichTextDocument;
	preferredEditorMode?: "raw" | "block";
	parentId?: string | null;
	tags?: string[];
};

export type UpdateNoteResult = {
	note?: NoteFile;
	versionCreated: boolean;
};

export async function updateNote(input: UpdateNoteInput): Promise<UpdateNoteResult> {
	const { supabase, user } = await getAuthenticatedUser();

	const patch: Partial<NoteRow> = {
		updated_at: new Date().toISOString(),
	};

	if (input.name !== undefined) {
		patch.name = input.name.endsWith(".md") ? input.name : `${input.name}.md`;
	}
	if (input.content !== undefined) {
		patch.content = input.content;
		patch.rich_content = input.richContent ?? markdownToRichDocument(input.content);
	} else if (input.richContent !== undefined) {
		patch.rich_content = input.richContent;
	}
	if (input.preferredEditorMode !== undefined) {
		patch.preferred_editor_mode = input.preferredEditorMode;
	}
	if (input.parentId !== undefined) {
		patch.parent_id = input.parentId;
	}
	if (input.tags !== undefined) {
		patch.tags = input.tags;
	}

	const { data, error } = await supabase
		.from("notes")
		.update(patch)
		.eq("user_id", user.id)
		.eq("id", input.id)
		.is("deleted_at", null)
		.select(NOTE_SELECT)
		.maybeSingle();

	if (error) throw error;
	if (!data) return { versionCreated: false };

	const updatedNote = rowToNoteFile(data as NoteRow);
	const versionReason: NoteVersionReason = input.name !== undefined ? "rename" : "autosave";
	const versionCreated = await insertNoteVersion(
		supabase,
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
	);

	return { note: updatedNote, versionCreated };
}

export async function restoreNoteVersion(versionId: string): Promise<UpdateNoteResult> {
	const { supabase, user } = await getAuthenticatedUser();
	const { data: versionRow, error: versionError } = await supabase
		.from("note_versions")
		.select(NOTE_VERSION_SELECT)
		.eq("user_id", user.id)
		.eq("id", versionId)
		.maybeSingle();

	if (versionError) throw versionError;
	if (!versionRow) {
		return { versionCreated: false };
	}

	const version = rowToNoteVersion(versionRow as NoteVersionRow);
	const current = await getNote(version.noteId);
	if (!current) {
		return { versionCreated: false };
	}

	await insertNoteVersion(
		supabase,
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

	const { data, error } = await supabase
		.from("notes")
		.update({
			name: version.name,
			content: version.content,
			rich_content: version.richContent,
			preferred_editor_mode: version.preferredEditorMode,
			parent_id: version.parentId,
			tags: version.tags ?? [],
			updated_at: new Date().toISOString(),
		})
		.eq("user_id", user.id)
		.eq("id", version.noteId)
		.is("deleted_at", null)
		.select(NOTE_SELECT)
		.maybeSingle();

	if (error) throw error;
	if (!data) return { versionCreated: true };

	return {
		note: rowToNoteFile(data as NoteRow),
		versionCreated: true,
	};
}

export async function deleteNote(id: string): Promise<void> {
	const { supabase, user } = await getAuthenticatedUser();

	const { error } = await supabase
		.from("notes")
		.update({ deleted_at: new Date().toISOString() })
		.eq("user_id", user.id)
		.eq("id", id)
		.is("deleted_at", null);

	if (error) throw error;
}
