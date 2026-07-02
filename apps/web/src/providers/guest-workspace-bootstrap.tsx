"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/core/auth/use-auth";
import { mergeSeedWithGuestWorkspace } from "@/core/workspace-backend";
import { isTauriRuntime } from "@/core/workspace-backend/tauri-backend";
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
	// Desktop is unauthenticated but NOT a guest — its workspace lives in the
	// vault via tauriBackend, and there is no seed snapshot to merge.
	const isGuest = auth.isReady && auth.phase !== "authenticated" && !isTauriRuntime();

	useEffect(() => {
		if (!isGuest) return;

		let cancelled = false;
		const localScope = notesKeys.localScope();
		const filesKey = notesKeys.files(localScope);
		const foldersKey = notesKeys.folders(localScope);

		void (async () => {
			const seedNotes = queryClient.getQueryData<NoteFile[]>(filesKey) ?? [];
			const seedMetadataNotes = new Set(seedNotes);
			const seedFolders = queryClient.getQueryData<NoteFolder[]>(foldersKey) ?? [];
			const merged = await mergeSeedWithGuestWorkspace(seedNotes, seedFolders);
			if (cancelled) return;

			queryClient.setQueryData(filesKey, merged.notes);
			queryClient.setQueryData(foldersKey, merged.folders);

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
