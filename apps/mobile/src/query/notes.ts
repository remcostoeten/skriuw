// React Query hooks over the WorkspaceBackend. Screens never touch the backend
// directly — they go through these so caching, invalidation and optimistic
// updates live in one place.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mobileBackend } from "@/backend/http-backend";
import type {
	CreateFolderInput,
	CreateNoteInput,
	NoteSummary,
	UpdateFolderInput,
	UpdateNoteInput,
} from "@/backend/types";
import { notesKeys } from "@/query/notes-keys";

export function useNotes(folderId?: string | null) {
	return useQuery({
		queryKey: notesKeys.files(folderId),
		queryFn: () => mobileBackend.listNotes(folderId),
	});
}

export function useNote(id: string) {
	return useQuery({
		queryKey: notesKeys.detail(id),
		queryFn: () => mobileBackend.getNote(id),
		enabled: Boolean(id),
	});
}

export function useFolders() {
	return useQuery({
		queryKey: notesKeys.folders,
		queryFn: () => mobileBackend.listFolders(),
	});
}

export function useSearch(query: string) {
	return useQuery({
		queryKey: notesKeys.search(query),
		queryFn: () => mobileBackend.search(query),
		enabled: query.trim().length > 0,
	});
}

export function useCreateNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateNoteInput) => mobileBackend.createNote(input),
		onSuccess: (note) => {
			qc.invalidateQueries({ queryKey: notesKeys.files(note.folderId) });
		},
	});
}

export function useUpdateNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: UpdateNoteInput) => mobileBackend.updateNote(input),
		onSuccess: (note) => {
			qc.setQueryData(notesKeys.detail(note.id), note);
			qc.invalidateQueries({ queryKey: notesKeys.files(note.folderId) });
		},
	});
}

export function useDeleteNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => mobileBackend.deleteNote(id),
		onMutate: async (id) => {
			// Optimistic removal from any cached list.
			await qc.cancelQueries({ queryKey: notesKeys.all });
			const lists = qc.getQueriesData<NoteSummary[]>({ queryKey: notesKeys.all });
			for (const [key, data] of lists) {
				if (Array.isArray(data)) {
					qc.setQueryData(
						key,
						data.filter((n) => n.id !== id),
					);
				}
			}
			return { lists };
		},
		onError: (_err, _id, ctx) => {
			ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
		},
		onSettled: () => {
			qc.invalidateQueries({ queryKey: notesKeys.all });
		},
	});
}

/** Move a note into another folder. Broader invalidation than useUpdateNote:
 *  both the source and target lists change, so we refresh every note list. */
export function useMoveNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; folderId: string | null }) =>
			mobileBackend.updateNote({ id: input.id, folderId: input.folderId }),
		onSettled: () => {
			qc.invalidateQueries({ queryKey: notesKeys.all });
		},
	});
}

// --- Folders ---------------------------------------------------------------

export function useCreateFolder() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateFolderInput) => mobileBackend.createFolder(input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: notesKeys.folders });
		},
	});
}

export function useUpdateFolder() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: UpdateFolderInput) => mobileBackend.updateFolder(input),
		onSettled: () => {
			qc.invalidateQueries({ queryKey: notesKeys.folders });
			// A move changes which notes render under which level.
			qc.invalidateQueries({ queryKey: notesKeys.all });
		},
	});
}

export function useDeleteFolder() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => mobileBackend.deleteFolder(id),
		onSettled: () => {
			qc.invalidateQueries({ queryKey: notesKeys.folders });
			// Deleting a folder soft-deletes its descendant notes too.
			qc.invalidateQueries({ queryKey: notesKeys.all });
		},
	});
}

/** Persist a drag-reorder. Folders and notes share one sort space per level,
 *  so the caller hands us the full ordered list and we PATCH sortOrder only for
 *  the items whose position actually changed. */
export type ReorderItem = { id: string; kind: "note" | "folder"; sortOrder: number };

export function useReorderWorkspace(folderId: string | null) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (ordered: ReorderItem[]) => {
			const writes: Promise<unknown>[] = [];
			ordered.forEach((item, index) => {
				if (item.sortOrder === index) return;
				writes.push(
					item.kind === "note"
						? mobileBackend.updateNote({ id: item.id, sortOrder: index })
						: mobileBackend.updateFolder({ id: item.id, sortOrder: index }),
				);
			});
			await Promise.all(writes);
		},
		// Re-sync sortOrder from the server after any reorder so a later drag
		// compares against fresh values (the local list stays put until then).
		onSettled: () => {
			qc.invalidateQueries({ queryKey: notesKeys.files(folderId) });
			qc.invalidateQueries({ queryKey: notesKeys.folders });
		},
	});
}
