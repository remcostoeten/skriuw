"use server";

import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { fromPersistedNote } from "@/domain/notes/mappers";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { isMissingNotesTagsColumnError } from "@/domain/notes/schema-compat";
import type {
	FolderId,
	IsoTime,
	MarkdownContent,
	NoteId,
	TagName,
} from "@/domain/persistence/types";
import type { NoteFile, RichTextDocument } from "@/domain/notes/models";
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

const NOTE_SELECT =
	"id, name, content, rich_content, preferred_editor_mode, parent_id, tags, journal_meta, created_at, updated_at";
const NOTE_SELECT_LEGACY =
	"id, name, content, rich_content, preferred_editor_mode, parent_id, journal_meta, created_at, updated_at";
const NOTE_METADATA_SELECT =
	"id, name, preferred_editor_mode, parent_id, tags, created_at, updated_at";
const NOTE_METADATA_SELECT_LEGACY =
	"id, name, preferred_editor_mode, parent_id, created_at, updated_at";

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

export async function updateNote(input: UpdateNoteInput): Promise<NoteFile | undefined> {
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
	if (!data) return undefined;

	return rowToNoteFile(data as NoteRow);
}

export async function deleteNote(id: string): Promise<void> {
	const { supabase, user } = await getAuthenticatedUser();

	const { error } = await supabase
		.from("notes")
		.update({ deleted_at: new Date().toISOString() })
		.eq("user_id", user.id)
		.eq("id", id);

	if (error) throw error;
}
