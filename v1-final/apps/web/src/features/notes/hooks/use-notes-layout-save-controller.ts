"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLazyRef } from "@/shared/lib/use-lazy-ref";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";
import { useNotesStore } from "@/features/notes/store";
import { useWorkspaceBackend, isTauriRuntime } from "@/core/workspace-backend";
import { isVaultConflictError } from "@/core/workspace-backend/tauri-backend";
import { richDocumentKey } from "@/domain/notes/rich-document";
import { noop } from "@/shared/lib/noop";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import type { NoteProperty } from "@/domain/notes/properties";
import { notesKeys } from "./notes-keys";
import { useDebouncedSave } from "./use-debounced-save";

type SaveState = "saving" | "saved" | "error" | "conflict";

type UseNotesLayoutSaveControllerOptions = {
	activeFileId: string;
	initialUserScopeId?: string | null;
	seededActiveFileId: string;
	setActiveFileId: (id: string) => void;
	setFileSaveState: (id: string, state: SaveState) => void;
	clearFileSaveState: (id: string) => void;
};

export function useNotesLayoutSaveController({
	activeFileId,
	initialUserScopeId,
	seededActiveFileId,
	setActiveFileId,
	setFileSaveState,
	clearFileSaveState,
}: UseNotesLayoutSaveControllerOptions) {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
	const saveResetTimeoutsRef = useLazyRef(() => new Map<string, number>());
	const previousActiveFileIdRef = useRef<string>("");
	const saveControllerRef = useRef<ReturnType<typeof useDebouncedSave> | null>(null);

	const clearPendingSaveReset = useCallback(
		(id: string) => {
			const timeoutId = saveResetTimeoutsRef.current.get(id);
			if (!timeoutId) return;
			window.clearTimeout(timeoutId);
			saveResetTimeoutsRef.current.delete(id);
		},
		[saveResetTimeoutsRef],
	);

	const markFileSaving = useCallback(
		(id: string) => {
			clearPendingSaveReset(id);
			setFileSaveState(id, "saving");
		},
		[clearPendingSaveReset, setFileSaveState],
	);

	const markFileSaved = useCallback(
		(id: string) => {
			clearPendingSaveReset(id);
			setFileSaveState(id, "saved");
			const timeoutId = window.setTimeout(() => {
				clearFileSaveState(id);
				saveResetTimeoutsRef.current.delete(id);
			}, 1800);
			saveResetTimeoutsRef.current.set(id, timeoutId);
		},
		[clearFileSaveState, clearPendingSaveReset, saveResetTimeoutsRef, setFileSaveState],
	);

	const markFileError = useCallback(
		(id: string, error: unknown) => {
			clearPendingSaveReset(id);
			setFileSaveState(id, isVaultConflictError(error) ? "conflict" : "error");
		},
		[clearPendingSaveReset, setFileSaveState],
	);

	const saveController = useDebouncedSave({
		onSaving: markFileSaving,
		onSaved: markFileSaved,
		onError: markFileError,
	});

	useEffect(() => {
		const discardResolvedDraft = (event: Event) => {
			const id = (event as CustomEvent<{ id?: string }>).detail?.id;
			if (id) saveController.discardPending(id);
		};
		window.addEventListener("vault-conflict:discard-draft", discardResolvedDraft);
		return () => {
			window.removeEventListener("vault-conflict:discard-draft", discardResolvedDraft);
		};
	}, [saveController]);

	useEffect(() => {
		saveControllerRef.current = saveController;
	}, [saveController]);

	useEffect(() => {
		if (seededActiveFileId && !useNotesStore.getState().activeFileId) {
			useNotesStore.getState().setActiveFileId(seededActiveFileId);
		}
		if (
			initialUserScopeId &&
			useSidebarStore.getState().currentUserScopeId !== initialUserScopeId
		) {
			useSidebarStore.getState().syncUserScope(initialUserScopeId);
		}
	}, [initialUserScopeId, seededActiveFileId]);

	useEffect(() => {
		const previousId = previousActiveFileIdRef.current;
		previousActiveFileIdRef.current = activeFileId;
		// react-doctor-disable-next-line react-doctor/no-event-handler -- flushing the previous note belongs to this mount/update effect.
		if (previousId && previousId !== activeFileId) {
			void saveController.flush(previousId);
		}
	}, [activeFileId, saveController]);

	// Local-first revalidation. Opening a note repaints its body instantly from
	// the cache — which may be a week-old, IndexedDB-persisted snapshot never
	// otherwise refreshed. Left stale, a note edited on another device/tab would
	// keep showing the old copy here and a later save would silently overwrite
	// the newer server version. Re-fetch the opened note in the background and
	// reconcile, but never at the cost of local work:
	//   - skip while the note has unsaved (dirty) edits;
	//   - re-check dirty after the fetch (the user may have started typing);
	//   - reference-equality CAS on the cached body so a mid-fetch optimistic
	//     write (a keystroke) is never clobbered by the older server copy;
	//   - only write when the content actually differs (avoids a needless
	//     editor re-render on every open).
	// Desktop is skipped: its local SQLite/vault is the single source of truth,
	// so there is no cross-device copy to reconcile.
	useEffect(() => {
		const id = activeFileId;
		if (!id || isTauriRuntime()) return;

		const before = queryClient.getQueryData<NoteFile | null>(notesKeys.detail(id));
		// Nothing cached yet → useNote() is already fetching a fresh body.
		if (before === undefined) return;
		if (saveController.getDirtyNoteIds().includes(id)) return;

		let cancelled = false;
		void (async () => {
			try {
				const fresh = await backend.getNote(id);
				if (cancelled || !fresh) return;
				if (saveController.getDirtyNoteIds().includes(id)) return;
				if (queryClient.getQueryData(notesKeys.detail(id)) !== before) return;
				const unchanged =
					before !== null &&
					before.content === fresh.content &&
					before.name === fresh.name &&
					richDocumentKey(before.richContent) === richDocumentKey(fresh.richContent);
				if (unchanged) return;
				queryClient.setQueryData(notesKeys.detail(id), fresh);
			} catch {
				noop();
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [activeFileId, backend, queryClient, saveController]);

	useEffect(
		() => () => {
			for (const timeoutId of saveResetTimeoutsRef.current.values()) {
				window.clearTimeout(timeoutId);
			}
			saveResetTimeoutsRef.current.clear();
			void saveControllerRef.current?.flushAll();
		},
		[saveResetTimeoutsRef],
	);

	useEffect(() => {
		const handleHidden = () => {
			void saveControllerRef.current?.flushAll();
		};
		const handleVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				handleHidden();
			}
		};

		window.addEventListener("pagehide", handleHidden);
		window.addEventListener("beforeunload", handleHidden);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			window.removeEventListener("pagehide", handleHidden);
			window.removeEventListener("beforeunload", handleHidden);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			void saveControllerRef.current?.flushAll();
		};
	}, []);

	const handleUpdateFileContent = useCallback(
		(
			id: string,
			content: string,
			options?: {
				richContent?: RichTextDocument;
				preferredEditorMode?: "raw" | "block";
				properties?: NoteProperty[];
			},
		) => {
			saveController.schedule({
				id,
				content,
				richContent: options?.richContent,
				preferredEditorMode: options?.preferredEditorMode,
				properties: options?.properties,
			});
		},
		[saveController],
	);

	const handleFlushFileEdits = useCallback(
		(id: string) => {
			void saveController.flush(id);
		},
		[saveController],
	);

	const runAfterContentFlush = useCallback(
		async (noteId: string, run: () => void) => {
			await saveController.flush(noteId, { createCheckpoint: true });
			run();
		},
		[saveController],
	);

	const flushContentInBackground = useCallback(
		(noteId: string) => {
			if (!noteId) return;
			void saveController.flush(noteId, { createCheckpoint: true });
		},
		[saveController],
	);

	const flushAllContent = useCallback(
		(options?: { createCheckpoint?: boolean }) => {
			void saveController.flushAll(options);
		},
		[saveController],
	);

	return {
		handleUpdateFileContent,
		handleFlushFileEdits,
		runAfterContentFlush,
		flushContentInBackground,
		flushAllContent,
		discardPending: saveController.discardPending,
		markFileSaving,
		markFileSaved,
		markFileError,
	};
}
