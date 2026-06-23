"use client";

import { useApiMutation } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import type { CreateNoteInput } from "@/domain/notes/actions";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
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
				// Dedupe by id so retries / double-fires don't duplicate the row.
				// Title-based dedupe is wrong here: every "New file" is "Untitled.md",
				// and the server allows same-named notes. The wiki-link create flow
				// resolves existing-by-title at its own call site before mutating.
				const id = input.id ?? crypto.randomUUID();
				if (list.some((note) => note.id === id)) {
					return list;
				}

				const optimisticNote: NoteFile = {
					id,
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
