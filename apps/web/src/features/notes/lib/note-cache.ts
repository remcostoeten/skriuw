"use client";

import type { QueryClient } from "@tanstack/react-query";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { type UpdateNoteInput } from "@/domain/notes/actions";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";

export type SavedNoteResult = {
	note?: NoteFile;
	versionCreated: boolean;
	versionChanged?: boolean;
	versionId?: string | null;
};

export function applyNoteUpdate(note: NoteFile, input: UpdateNoteInput): NoteFile {
	return {
		...note,
		name: input.name
			? input.name.endsWith(".md")
				? input.name
				: `${input.name}.md`
			: note.name,
		content: input.content ?? note.content,
		richContent:
			input.richContent ??
			(input.content !== undefined
				? markdownToRichDocument(input.content)
				: note.richContent),
		preferredEditorMode: input.preferredEditorMode ?? note.preferredEditorMode,
		parentId: input.parentId === undefined ? note.parentId : input.parentId,
		sortOrder: input.sortOrder === undefined ? note.sortOrder : input.sortOrder,
		tags: input.tags === undefined ? note.tags : input.tags,
		modifiedAt: new Date(),
	};
}

export function reconcileSavedNoteCache(
	queryClient: QueryClient,
	input: UpdateNoteInput,
	result: SavedNoteResult,
	options: { updateFiles?: boolean } = {},
): void {
	const { updateFiles = true } = options;

	if (result.note) {
		if (updateFiles) {
			queryClient.setQueryData<NoteFile[]>(notesKeys.files(), (current = []) =>
				current.map((note) => (note.id === result.note!.id ? result.note! : note)),
			);
		}
		queryClient.setQueryData(notesKeys.detail(result.note.id), result.note);
		void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
	} else {
		// Keep the detail view coherent even if the server didn't return a full note.
		queryClient.setQueryData<NoteFile | null>(notesKeys.detail(input.id), (current) =>
			current ? applyNoteUpdate(current, input) : current,
		);
	}

	if (result.versionChanged ?? result.versionCreated) {
		void queryClient.invalidateQueries({ queryKey: notesKeys.versions(input.id) });
	}
}
