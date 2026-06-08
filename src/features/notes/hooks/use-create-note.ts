"use client";

import { useApiMutation } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import type { CreateNoteInput } from "@/domain/notes/actions";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { findNoteByTitle } from "@/domain/notes/note-links";
import { trackProductEvent } from "@/core/analytics/client";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { usePreferencesStore } from "@/features/settings/store";
import { notesKeys } from "./notes-keys";
import type { NoteFile } from "@/types/notes";

export function useCreateNote() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();

	return useApiMutation<CreateNoteInput, NoteFile, NoteFile[]>(backend.createNote, {
		onSuccess: (note) => {
			queryClient.setQueryData(notesKeys.detail(note.id), note);
			void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
			usePreferencesStore.getState().incrementNoteCount();
			trackProductEvent("note_created");
		},
		optimistic: {
			queryKey: notesKeys.files(),
			updater: (current, input) => {
				const list = current ?? [];
				const existing = findNoteByTitle(list, input.name);
				if (existing) {
					return list;
				}

				const optimisticNote: NoteFile = {
					id: input.id ?? crypto.randomUUID(),
					name: input.name.endsWith(".md") ? input.name : `${input.name}.md`,
					content: input.content,
					richContent: input.richContent ?? markdownToRichDocument(input.content),
					preferredEditorMode: input.preferredEditorMode ?? "block",
					createdAt: new Date(),
					modifiedAt: new Date(),
					parentId: input.parentId ?? null,
					sortOrder: input.sortOrder ?? current?.length ?? 0,
					tags: input.tags ?? [],
				};

				return [...list, optimisticNote];
			},
		},
	});
}
