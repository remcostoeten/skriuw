"use client";

import { useApiMutation } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { updateNote, type UpdateNoteInput } from "@/domain/notes/api";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { notesKeys } from "./use-notes";
import type { NoteFile } from "@/types/notes";

function applyNoteUpdate(note: NoteFile, input: UpdateNoteInput): NoteFile {
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
		tags: input.tags === undefined ? note.tags : input.tags,
		modifiedAt: new Date(),
	};
}

export function useUpdateNote() {
	const queryClient = useQueryClient();

	return useApiMutation<
		UpdateNoteInput,
		{ note?: NoteFile; versionCreated: boolean },
		NoteFile[]
	>(updateNote, {
		invalidateKeys: [],
		onSuccess: (result, input) => {
			if (result.note) {
				queryClient.setQueryData(notesKeys.detail(result.note.id), result.note);
				void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
			} else {
				// Even if the server returned nothing, make sure the detail cache
				// reflects the optimistic write so the editor doesn't flash stale data.
				queryClient.setQueryData<NoteFile | null>(
					notesKeys.detail(input.id),
					(current) => (current ? applyNoteUpdate(current, input) : current),
				);
			}

			if (result.versionCreated) {
				void queryClient.invalidateQueries({ queryKey: notesKeys.versions(input.id) });
			}
		},
		optimistic: {
			queryKey: notesKeys.files(),
			updater: (current, input) => {
				// Also patch the detail cache so that components reading from
				// notesKeys.detail(id) (e.g. the block editor) see the update
				// immediately — not just after the server responds.
				queryClient.setQueryData<NoteFile | null>(
					notesKeys.detail(input.id),
					(current) => (current ? applyNoteUpdate(current, input) : current),
				);

				return (current ?? []).map((note) =>
					note.id === input.id ? applyNoteUpdate(note, input) : note,
				);
			},
		},
	});
}
