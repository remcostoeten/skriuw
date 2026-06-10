"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/core/auth/use-auth";
import { mergeSeedWithGuestWorkspace } from "@/core/workspace-backend";
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

		let cancelled = false;

		void (async () => {
			const seedNotes = queryClient.getQueryData<NoteFile[]>(notesKeys.files()) ?? [];
			const seedMetadataNotes = new Set(seedNotes);
			const seedFolders = queryClient.getQueryData<NoteFolder[]>(notesKeys.folders()) ?? [];
			const merged = await mergeSeedWithGuestWorkspace(seedNotes, seedFolders);
			if (cancelled) return;

			queryClient.setQueryData(notesKeys.files(), merged.notes);
			queryClient.setQueryData(notesKeys.folders(), merged.folders);

			for (const note of merged.notes) {
				if (seedMetadataNotes.has(note)) continue;
				queryClient.setQueryData(notesKeys.detail(note.id), note);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [isGuest, queryClient]);

	return null;
}
