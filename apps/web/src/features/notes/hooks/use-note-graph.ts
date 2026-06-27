"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/core/auth/use-auth";
import type { NoteFile } from "@/domain/notes/models";
import { buildGraphFromNotes } from "@/domain/notes/graph-from-notes";
import type { GraphData } from "@/domain/notes/graph";
import { useApiQuery } from "@/shared/api/use-api-query";
import { notesKeys } from "../lib/notes-keys";
import { useWorkspaceBackend } from "@/core/workspace-backend";

function resolveGuestNotesForGraph(
	files: NoteFile[],
	getDetail: (id: string) => NoteFile | null | undefined,
): NoteFile[] {
	return files.map((file) => {
		if (file.content || (file.richContent?.length ?? 0) > 0) return file;
		return getDetail(file.id) ?? file;
	});
}

export function useNoteGraph() {
	const auth = useAuth();
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
	const guestRevision = queryClient.getQueryState(notesKeys.files())?.dataUpdatedAt ?? 0;
	const isGuest = auth.phase !== "authenticated";

	const queryKey = isGuest
		? ([...notesKeys.graph(), "guest", guestRevision] as const)
		: notesKeys.graph();

	return useApiQuery<GraphData>(
		queryKey,
		async () => {
			if (auth.phase === "authenticated") {
				return backend.getNoteGraph();
			}

			const files = queryClient.getQueryData<NoteFile[]>(notesKeys.files()) ?? [];
			const notes = resolveGuestNotesForGraph(files, (id) =>
				queryClient.getQueryData<NoteFile | null>(notesKeys.detail(id)),
			);
			return buildGraphFromNotes(notes);
		},
		{
			enabled: auth.isReady,
			staleTime: isGuest ? 0 : 5 * 60_000,
			gcTime: 30 * 60_000,
		},
	);
}
