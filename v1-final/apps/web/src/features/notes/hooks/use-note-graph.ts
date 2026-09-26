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
	const graphScope =
		auth.phase === "authenticated" && auth.user
			? notesKeys.userScope(auth.user.id)
			: notesKeys.localScope();
	const localFilesKey = notesKeys.files(notesKeys.localScope());
	const guestRevision = queryClient.getQueryState(localFilesKey)?.dataUpdatedAt ?? 0;
	const isGuest = auth.phase !== "authenticated";

	const queryKey = isGuest
		? ([...notesKeys.graph(graphScope), "guest", guestRevision] as const)
		: notesKeys.graph(graphScope);

	return useApiQuery<GraphData>(
		queryKey,
		async () => {
			if (auth.phase === "authenticated") {
				return backend.getNoteGraph();
			}

			const files = queryClient.getQueryData<NoteFile[]>(localFilesKey) ?? [];
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
