"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/core/auth/use-auth";
import { mergeSeedWithGuestFolders, mergeSeedWithGuestNotes } from "@/core/workspace-backend";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";

/**
 * Runs only when there is no authenticated user. On mount, layers any
 * locally-persisted guest mutations on top of the server-hydrated seed snapshot.
 * Without this, a guest's localStorage edits would be invisible after a reload
 * because the seed bundle would otherwise overwrite them.
 */
export function GuestWorkspaceBootstrap() {
	const auth = useAuth();
	const queryClient = useQueryClient();
	const isGuest = auth.isReady && auth.phase !== "authenticated";

	useEffect(() => {
		if (!isGuest) return;

		const seedNotes = queryClient.getQueryData<NoteFile[]>(notesKeys.files()) ?? [];
		const seedMetadataNotes = new Set(seedNotes);
		const mergedNotes = mergeSeedWithGuestNotes(seedNotes);
		queryClient.setQueryData(notesKeys.files(), mergedNotes);

		const seedFolders = queryClient.getQueryData<NoteFolder[]>(notesKeys.folders()) ?? [];
		const mergedFolders = mergeSeedWithGuestFolders(seedFolders);
		queryClient.setQueryData(notesKeys.folders(), mergedFolders);

		for (const note of mergedNotes) {
			if (seedMetadataNotes.has(note)) continue;
			queryClient.setQueryData(notesKeys.detail(note.id), note);
		}
	}, [isGuest, queryClient]);

	return null;
}
