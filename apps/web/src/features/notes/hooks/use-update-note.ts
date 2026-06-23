"use client";

import { useApiMutation } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import type { UpdateNoteInput } from "@/domain/notes/actions";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { notesKeys } from "./notes-keys";
import type { NoteFile } from "@/types/notes";
import { applyNoteUpdate, reconcileSavedNoteCache } from "@/features/notes/lib/note-cache";

export function useUpdateNote() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();

	return useApiMutation<
		UpdateNoteInput,
		{
			note?: NoteFile;
			versionCreated: boolean;
			versionChanged?: boolean;
			versionId?: string | null;
		}
	>(
		backend.updateNote,
		{
			invalidateKeys: [],
			onSuccess: (result, input) => {
				reconcileSavedNoteCache(queryClient, input, result);
			},
			optimistic: {
				updates: [
					{
						queryKey: notesKeys.files(),
						updater: (current: NoteFile[] | undefined, input) =>
							(current ?? []).map((note) =>
								note.id === input.id ? applyNoteUpdate(note, input) : note,
							),
					},
					{
						queryKey: (input) => notesKeys.detail(input.id),
						updater: (current: NoteFile | null | undefined, input) =>
							current ? applyNoteUpdate(current, input) : current,
					},
				],
			},
		},
	);
}
