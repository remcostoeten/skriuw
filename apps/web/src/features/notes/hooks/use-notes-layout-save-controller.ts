"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";
import { useNotesStore } from "@/features/notes/store";
import type { RichTextDocument } from "@/types/notes";
import type { NoteProperty } from "@/domain/notes/properties";
import { useDebouncedSave } from "./use-debounced-save";

type SaveState = "saving" | "saved" | "error";

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
	const saveResetTimeoutsRef = useRef(new Map<string, number>());
	const previousActiveFileIdRef = useRef<string>("");
	const saveControllerRef = useRef<ReturnType<typeof useDebouncedSave> | null>(null);

	const clearPendingSaveReset = useCallback((id: string) => {
		const timeoutId = saveResetTimeoutsRef.current.get(id);
		if (!timeoutId) return;
		window.clearTimeout(timeoutId);
		saveResetTimeoutsRef.current.delete(id);
	}, []);

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
		[clearFileSaveState, clearPendingSaveReset, setFileSaveState],
	);

	const markFileError = useCallback(
		(id: string) => {
			clearPendingSaveReset(id);
			setFileSaveState(id, "error");
		},
		[clearPendingSaveReset, setFileSaveState],
	);

	const saveController = useDebouncedSave({
		onSaving: markFileSaving,
		onSaved: markFileSaved,
		onError: markFileError,
	});

	useEffect(() => {
		saveControllerRef.current = saveController;
	}, [saveController]);

	useEffect(() => {
		if (seededActiveFileId && !useNotesStore.getState().activeFileId) {
			setActiveFileId(seededActiveFileId);
		}
		if (
			initialUserScopeId &&
			useSidebarStore.getState().currentUserScopeId !== initialUserScopeId
		) {
			useSidebarStore.getState().syncUserScope(initialUserScopeId);
		}
	}, [initialUserScopeId, seededActiveFileId, setActiveFileId]);

	useEffect(() => {
		const previousId = previousActiveFileIdRef.current;
		previousActiveFileIdRef.current = activeFileId;
		if (previousId && previousId !== activeFileId) {
			void saveController.flush(previousId);
		}
	}, [activeFileId, saveController]);

	useEffect(
		() => () => {
			for (const timeoutId of saveResetTimeoutsRef.current.values()) {
				window.clearTimeout(timeoutId);
			}
			saveResetTimeoutsRef.current.clear();
			void saveControllerRef.current?.flushAll();
		},
		[],
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
