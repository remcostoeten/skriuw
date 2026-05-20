"use server";

import { getAuthenticatedUser } from "@/core/supabase/server-client";
import type { FolderId, IsoTime, MarkdownContent, NoteId, TagName } from "@/core/persistence-types";
import { isMissingNotesTagsColumnError } from "@/domain/notes/schema-compat";
import { buildNoteBacklinks, type ResolvedNoteLink } from "@/features/notes/lib/note-links";
import type { NoteFile } from "@/types/notes";

type NoteContentRow = {
	id: string;
	name: string;
	content: string;
	preferred_editor_mode: "raw" | "block" | null;
	parent_id: string | null;
	tags?: string[] | null;
	created_at: string;
	updated_at: string;
};

const NOTE_CONTENT_SELECT =
	"id, name, content, preferred_editor_mode, parent_id, tags, created_at, updated_at";
const NOTE_CONTENT_SELECT_LEGACY =
	"id, name, content, preferred_editor_mode, parent_id, created_at, updated_at";

function rowToContentNote(row: NoteContentRow): NoteFile {
	return {
		id: row.id as NoteId,
		name: row.name,
		content: row.content as MarkdownContent,
		richContent: [],
		preferredEditorMode: row.preferred_editor_mode ?? "block",
		parentId: row.parent_id as FolderId | null,
		tags: row.tags?.map((tag) => tag as TagName),
		createdAt: new Date(row.created_at as IsoTime),
		modifiedAt: new Date(row.updated_at as IsoTime),
	};
}

export async function listNoteBacklinks(noteId: string): Promise<ResolvedNoteLink[]> {
	const { supabase, user } = await getAuthenticatedUser();

	const initialResult = await supabase
		.from("notes")
		.select(NOTE_CONTENT_SELECT)
		.eq("user_id", user.id)
		.is("deleted_at", null);
	let data = initialResult.data as NoteContentRow[] | null;
	let error = initialResult.error;

	if (error && isMissingNotesTagsColumnError(error)) {
		const fallbackResult = await supabase
			.from("notes")
			.select(NOTE_CONTENT_SELECT_LEGACY)
			.eq("user_id", user.id)
			.is("deleted_at", null);
		data = fallbackResult.data as NoteContentRow[] | null;
		error = fallbackResult.error;
	}

	if (error) throw error;

	const files = (data ?? []).map((row: NoteContentRow) => rowToContentNote(row));
	const activeNote = files.find((file) => file.id === noteId);

	if (!activeNote) return [];

	return buildNoteBacklinks(activeNote, files);
}
