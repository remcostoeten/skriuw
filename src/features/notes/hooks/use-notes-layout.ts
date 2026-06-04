"use client";

import { useShortcut } from "@remcostoeten/use-shortcut";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { type PanInfo, type Transition, useDragControls, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreateFolderInput } from "@/domain/folders/actions";
import { fetchNote, type CreateNoteInput } from "@/domain/notes/actions";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { isMdxNote, resolveEditorMode } from "@/features/editor/lib/editor-mode";
import { buildNoteIndexes } from "@/features/notes/lib/note-indexes";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";
import { applyFolderUiState, useNotesStore, type EditorPane } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { EASE_SHEET } from "@/shared/lib/motion";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import type { CommandPaletteItem } from "@/shared/ui/command-palette";
import type { ShortcutHelpGroup } from "@/shared/ui/shortcut-help-dialog";
import type { NoteVersion } from "@/types/notes";
import { DESKTOP_SIDEBAR_MIN_WIDTH } from "../constants";
import type { NoteTreeActions, NoteTreeQueries } from "../lib/tree-actions";
import { useCreateFolder } from "./use-create-folder";
import { useCreateNote } from "./use-create-note";
import { useDebouncedSave } from "./use-debounced-save";
import { useDeleteFolder } from "./use-delete-folder";
import { useDeleteNote } from "./use-delete-note";
import { useFolders } from "./use-folders";
import { useNote } from "./use-note";
import { useNotes } from "./use-notes";
import { notesKeys } from "./notes-keys";
import {
	clearNoteUrl,
	type NoteUrlSyncOptions,
	useFileNavigation,
	useUrlSync,
} from "./use-notes-navigation";
import { useRestoreNoteVersion } from "./use-restore-note-version";
import { useUpdateFolder } from "./use-update-folder";
import { useUpdateNote } from "./use-update-note";

const SHEET_DISMISS_VELOCITY = 480;
const SHEET_DRAG_BLOCKLIST =
	"button, a, input, textarea, select, option, [role='button'], [role='tab'], [contenteditable='true'], [data-sheet-no-drag]";
const DESKTOP_SIDEBAR_MAX_WIDTH = 420;
const SAVED_BADGE_DURATION_MS = 1800;

function generateNoteContent(name: string): string {
	const title = name.replace(/\.md$/, "");
	return `# ${title}

#draft #idea

Start writing here. Use # for tags, @ to mention notes, or /tag and /link note from the block editor.
`;
}

const NOTES_SHORTCUT_GROUPS: ShortcutHelpGroup[] = [
	{
		id: "notes-global",
		title: "Notes",
		shortcuts: [
			{
				id: "palette",
				label: "Open command palette",
				combo: "mod+k / mod+shift+p",
			},
			{
				id: "new-note",
				label: "Create note",
				combo: "mod+n",
			},
			{
				id: "new-folder",
				label: "Create folder",
				combo: "mod+shift+n",
			},
			{
				id: "toggle-sidebar",
				label: "Toggle sidebar",
				combo: "mod+b",
			},
			{
				id: "toggle-metadata",
				label: "Toggle note details",
				combo: "mod+shift+b",
			},
			{
				id: "settings",
				label: "Open settings",
				combo: "mod+comma",
			},
			{
				id: "help",
				label: "Open shortcut help",
				combo: "shift+slash",
			},
		],
	},
];

type UseNotesLayoutOptions = {
	initialActiveFileId?: string | null;
	initialUserScopeId?: string | null;
};

export function useNotesLayout(options: UseNotesLayoutOptions = {}) {
	const { initialActiveFileId, initialUserScopeId } = options;

	// Capture the server-provided seed once. We can't mutate the Zustand
	// singletons during render (would pollute concurrent SSR requests and
	// trigger a hydration mismatch on the client). Instead, hold the seed
	// locally and OR it with the live store value below so the first paint
	// — on server and client — already reflects the right active note.
	const [seededActiveFileId] = useState(() => initialActiveFileId ?? "");

	const router = useRouter();
	const queryClient = useQueryClient();
	const $ = useShortcut({ ignoreInputs: true });
	const notesQuery = useNotes();
	const foldersQuery = useFolders();
	const activeFileIdFromStore = useNotesStore((state) => state.activeFileId);
	// While Zustand hasn't been seeded yet, prefer the value the server picked
	// (URL ?note= → files[0]) so the first paint already targets the right
	// note. Once an effect copies the seed into Zustand, this OR collapses to
	// the live store value and behaves exactly as before.
	const activeFileId = activeFileIdFromStore || seededActiveFileId;
	const activeNoteQuery = useNote(activeFileId);
	const splitSecondaryFileId = useNotesStore((state) => state.split.secondaryFileId);
	const focusedEditorPane = useNotesStore((state) => state.split.focusedPane);
	const editorScrollPositions = useNotesStore((state) => state.split.scrollPositions);
	const splitOrientation = useNotesStore((state) => state.split.orientation);
	const splitSecondaryFirst = useNotesStore((state) => state.split.secondaryFirst);
	const openSplitBeside = useNotesStore((state) => state.openSplitBeside);
	const setSecondaryFile = useNotesStore((state) => state.setSecondaryFile);
	const closeSplit = useNotesStore((state) => state.closeSplit);
	const setFocusedEditorPane = useNotesStore((state) => state.setFocusedEditorPane);
	const setEditorScrollPosition = useNotesStore((state) => state.setEditorScrollPosition);
	const toggleSplitOrientation = useNotesStore((state) => state.toggleSplitOrientation);
	const swapSplitPaneOrder = useNotesStore((state) => state.swapSplitPaneOrder);
	const secondaryNoteQuery = useNote(splitSecondaryFileId ?? "");
	const folderOpenState = useNotesStore((state) => state.folderOpenState);
	const activeFileSaveState = useNotesStore((state) =>
		state.getFileSaveState(state.activeFileId || seededActiveFileId),
	);
	const setActiveFileId = useNotesStore((state) => state.setActiveFileId);
	const setFileSaveState = useNotesStore((state) => state.setFileSaveState);
	const clearFileSaveState = useNotesStore((state) => state.clearFileSaveState);
	const setFolderOpen = useNotesStore((state) => state.setFolderOpen);
	const collapseAllFolders = useNotesStore((state) => state.collapseAllFolders);
	const expandAllFolders = useNotesStore((state) => state.expandAllFolders);
	const createNoteMutation = useCreateNote();
	const createFolderMutation = useCreateFolder();
	const updateNoteMutation = useUpdateNote();
	const updateFolderMutation = useUpdateFolder();
	const deleteNoteMutation = useDeleteNote();
	const deleteFolderMutation = useDeleteFolder();
	const [creationParentFolderId, setCreationParentFolderId] = useState<string | null>(null);
	const saveResetTimeoutsRef = useRef(new Map<string, number>());
	const clearPendingSaveReset = useCallback((id: string) => {
		const timeoutId = saveResetTimeoutsRef.current.get(id);
		if (timeoutId) {
			window.clearTimeout(timeoutId);
			saveResetTimeoutsRef.current.delete(id);
		}
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
			}, SAVED_BADGE_DURATION_MS);
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
	const handleUpdateFileContent = useCallback(
		(
			id: string,
			content: string,
			options?: {
				richContent?: ReturnType<typeof markdownToRichDocument>;
				preferredEditorMode?: "raw" | "block";
			},
		) => {
			saveController.schedule({
				id,
				content,
				richContent: options?.richContent,
				preferredEditorMode: options?.preferredEditorMode,
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
	const metadataFiles = notesQuery.data ?? [];
	const activeNote = activeNoteQuery.isPlaceholderData ? null : (activeNoteQuery.data ?? null);
	const secondaryNote =
		secondaryNoteQuery.isPlaceholderData ? null : (secondaryNoteQuery.data ?? null);
	const files = useMemo(() => {
		let nextFiles = metadataFiles;

		if (activeNote) {
			let found = false;
			nextFiles = nextFiles.map((file) => {
				if (file.id !== activeNote.id) return file;
				found = true;
				return activeNote;
			});
			if (!found) {
				nextFiles = [...nextFiles, activeNote];
			}
		}

		if (secondaryNote) {
			let found = false;
			nextFiles = nextFiles.map((file) => {
				if (file.id !== secondaryNote.id) return file;
				found = true;
				return secondaryNote;
			});
			if (!found) {
				nextFiles = [...nextFiles, secondaryNote];
			}
		}

		return nextFiles;
	}, [activeNote, metadataFiles, secondaryNote]);
	const folders = useMemo(
		() => applyFolderUiState(foldersQuery.data ?? [], folderOpenState),
		[folderOpenState, foldersQuery.data],
	);

	const ui = useNotesStore((state) => state.ui);
	const setUIState = useNotesStore((state) => state.setUIState);
	const setSidebarWidth = useNotesStore((state) => state.setSidebarWidth);
	const { showSidebar, showMetadata, sidebarWidth, isMobile } = ui;

	const initializePreferences = usePreferencesStore((state) => state.initialize);
	const defaultModeRaw = usePreferencesStore((state) => state.editor.defaultModeRaw);
	const diaryModeEnabled = usePreferencesStore((state) => state.journal.diaryModeEnabled);
	const [showCommandPalette, setShowCommandPalette] = useState(false);
	const [showShortcutHelp, setShowShortcutHelp] = useState(false);
	const [viewingVersion, setViewingVersion] = useState<NoteVersion | null>(null);
	const [sharingNoteId, setSharingNoteId] = useState<string | null>(null);
	const restoreNoteVersion = useRestoreNoteVersion();
	const prefersReducedMotion = useReducedMotion();
	const metadataDragControls = useDragControls();
	const sidebarResizeActiveRef = useRef(false);
	const sidebarRef = useRef<HTMLDivElement>(null);
	const {
		filesById,
		foldersById,
		filesByParentId,
		foldersByParentId,
		descendantCountByFolderId,
	} = useMemo(
		() => buildNoteIndexes(files, folders, activeFileId),
		[files, folders, activeFileId],
	);
	const activeFile = activeNote;
	const secondaryFile = useMemo(() => {
		if (!splitSecondaryFileId) return null;
		return files.find((file) => file.id === splitSecondaryFileId) ?? secondaryNote;
	}, [files, secondaryNote, splitSecondaryFileId]);
	const splitEnabled = Boolean(
		splitSecondaryFileId && secondaryFile && !isMobile && !sharingNoteId && !viewingVersion,
	);
	const focusedFile =
		splitEnabled && focusedEditorPane === "secondary" && secondaryFile
			? secondaryFile
			: activeFile;

	// Resolve the editor surface synchronously from the active note. Deriving
	// (instead of holding state synced by an effect) means the mode is correct
	// on the same commit the note becomes available — no one-frame flash where
	// the gate clears but the mode is still null and the raw <textarea> shows.
	// Toggling persists `preferredEditorMode` and updates the detail cache
	// optimistically, so the toggle flows back through here without local state.
	const editorMode = useMemo<"raw" | "block" | null>(() => {
		if (!activeFile) return null;
		return resolveEditorMode(activeFile, defaultModeRaw ? "raw" : "block");
	}, [activeFile, defaultModeRaw]);

	const secondaryEditorMode = useMemo<"raw" | "block">(() => {
		if (!secondaryFile) return "block";
		return resolveEditorMode(secondaryFile, defaultModeRaw ? "raw" : "block");
	}, [secondaryFile, defaultModeRaw]);

	const focusedEditorMode = useMemo<"raw" | "block" | null>(() => {
		if (!focusedFile) return null;
		return resolveEditorMode(focusedFile, defaultModeRaw ? "raw" : "block");
	}, [focusedFile, defaultModeRaw]);

	// Warm the detail cache for a note before it is opened. `useNote` keeps
	// fetched notes fresh forever (staleTime: Infinity), so a single prefetch
	// turns the eventual click into an instant, skeleton-free swap.
	const prefetchNote = useCallback(
		(id: string) => {
			if (!id) return;
			if (queryClient.getQueryData(notesKeys.detail(id)) !== undefined) return;
			void queryClient.prefetchQuery({
				queryKey: notesKeys.detail(id),
				queryFn: () => fetchNote(id),
				staleTime: Number.POSITIVE_INFINITY,
			});
		},
		[queryClient],
	);

	const { handleFileSelect: syncFileSelection } = useUrlSync(setActiveFileId);
	const focusedFileIdForNav =
		splitEnabled && focusedEditorPane === "secondary" && splitSecondaryFileId
			? splitSecondaryFileId
			: activeFileId;
	const { canNavigatePrev, canNavigateNext } = useFileNavigation(files, focusedFileIdForNav);

	useEffect(() => {
		if (!isMobile || !splitSecondaryFileId) return;
		closeSplit();
	}, [closeSplit, isMobile, splitSecondaryFileId]);

	useEffect(() => {
		if (!splitSecondaryFileId || secondaryFile) return;
		closeSplit();
	}, [closeSplit, secondaryFile, splitSecondaryFileId]);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 767px)");
		const syncViewport = (event?: MediaQueryListEvent) => {
			const mobile = event?.matches ?? mediaQuery.matches;
			setUIState({
				isMobile: mobile,
				showSidebar: !mobile,
				showMetadata: !mobile,
			});
		};

		syncViewport();
		mediaQuery.addEventListener("change", syncViewport);

		return () => mediaQuery.removeEventListener("change", syncViewport);
	}, [setUIState]);

	useEffect(() => {
		initializePreferences();
	}, [initializePreferences]);

	useEffect(
		() => () => {
			for (const timeoutId of saveResetTimeoutsRef.current.values()) {
				window.clearTimeout(timeoutId);
			}
			saveResetTimeoutsRef.current.clear();
		},
		[],
	);

	// Push the server-provided seeds into the persisted stores on mount so
	// subsequent renders read them from Zustand directly (no longer relying
	// on the local OR). Also fast-paths the sidebar profile switch that
	// PersistenceBootstrap normally does once auth resolves — by the time
	// this effect runs we already know the user's id from the SSR prop.
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
	}, [seededActiveFileId, initialUserScopeId, setActiveFileId]);

	useEffect(() => {
		if (notesQuery.isPending) {
			return;
		}

		if (files.length === 0) {
			if (activeFileId) {
				setActiveFileId("");
				clearNoteUrl({ mode: "replace" });
			}
			return;
		}

		if (activeFileId && files.some((file) => file.id === activeFileId)) {
			return;
		}

		syncFileSelection(files[0].id, { mode: "replace" });
	}, [activeFileId, files, notesQuery.isPending, setActiveFileId, syncFileSelection]);

	useEffect(() => {
		if (viewingVersion && viewingVersion.noteId !== activeFileId) {
			setViewingVersion(null);
		}
	}, [activeFileId, viewingVersion]);

	useEffect(() => {
		if (sharingNoteId && sharingNoteId !== activeFileId) {
			setSharingNoteId(null);
		}
	}, [activeFileId, sharingNoteId]);

	const previousActiveFileIdRef = useRef<string>("");
	useEffect(() => {
		const previousId = previousActiveFileIdRef.current;
		previousActiveFileIdRef.current = activeFileId;
		if (previousId && previousId !== activeFileId) {
			void saveController.flush(previousId);
		}
	}, [activeFileId, saveController]);

	// Warm the neighbours of the active note so prev/next keyboard navigation
	// resolves from cache instead of fetching (and flashing a skeleton).
	useEffect(() => {
		if (!activeFileId) return;
		const index = files.findIndex((file) => file.id === activeFileId);
		if (index === -1) return;
		prefetchNote(files[index - 1]?.id ?? "");
		prefetchNote(files[index + 1]?.id ?? "");
	}, [activeFileId, files, prefetchNote]);

	const saveControllerRef = useRef(saveController);
	useEffect(() => {
		saveControllerRef.current = saveController;
	}, [saveController]);

	useEffect(() => {
		const handleHidden = () => {
			void saveControllerRef.current.flushAll();
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
			void saveControllerRef.current.flushAll();
		};
	}, []);

	const handleViewVersion = useCallback(
		(version: NoteVersion) => {
			void saveController.flush(version.noteId, { createCheckpoint: true });
			setSharingNoteId(null);
			setViewingVersion(version);
		},
		[saveController],
	);

	const handleExitVersionPreview = useCallback(() => {
		setViewingVersion(null);
	}, []);

	const handleOpenShare = useCallback((noteId: string) => {
		setViewingVersion(null);
		setSharingNoteId(noteId);
	}, []);

	const handleCloseShare = useCallback(() => {
		setSharingNoteId(null);
	}, []);

	const handleRestoreViewedVersion = useCallback(() => {
		if (!viewingVersion) return;
		saveController.discardPending(viewingVersion.noteId);
		restoreNoteVersion.mutate(viewingVersion.id, {
			onSuccess: () => {
				setViewingVersion(null);
			},
		});
	}, [restoreNoteVersion, saveController, viewingVersion]);

	useEffect(() => {
		if (!isMobile) {
			return;
		}

		const hasOverlayOpen = showSidebar || showMetadata || showShortcutHelp;
		document.body.style.overflow = hasOverlayOpen ? "hidden" : "";

		return () => {
			document.body.style.overflow = "";
		};
	}, [isMobile, showSidebar, showMetadata, showShortcutHelp]);

	useEffect(() => {
		const stopResizing = () => {
			if (!sidebarResizeActiveRef.current) return;
			sidebarResizeActiveRef.current = false;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		const handlePointerMove = (event: PointerEvent) => {
			if (!sidebarResizeActiveRef.current || !sidebarRef.current) return;

			const { left } = sidebarRef.current.getBoundingClientRect();
			const nextWidth = Math.min(
				DESKTOP_SIDEBAR_MAX_WIDTH,
				Math.max(DESKTOP_SIDEBAR_MIN_WIDTH, event.clientX - left),
			);

			setSidebarWidth(nextWidth);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", stopResizing);
		window.addEventListener("pointercancel", stopResizing);

		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", stopResizing);
			window.removeEventListener("pointercancel", stopResizing);
			stopResizing();
		};
	}, [setSidebarWidth]);

	const handleFileSelect = useCallback(
		(id: string, options?: NoteUrlSyncOptions) => {
			triggerNativeFeedback("selection");

			if (splitSecondaryFileId && !isMobile) {
				if (id === activeFileId) {
					setFocusedEditorPane("primary");
					if (isMobile) {
						setUIState({ showSidebar: false });
					}
					return;
				}
				if (id === splitSecondaryFileId) {
					setFocusedEditorPane("secondary");
					if (isMobile) {
						setUIState({ showSidebar: false });
					}
					return;
				}

				if (focusedEditorPane === "secondary") {
					void runAfterContentFlush(splitSecondaryFileId, () => {
						setSecondaryFile(id);
					});
				} else {
					void runAfterContentFlush(activeFileId, () => {
						syncFileSelection(id, options);
					});
				}

				if (isMobile) {
					setUIState({ showSidebar: false });
				}
				return;
			}

			void runAfterContentFlush(activeFileId, () => {
				syncFileSelection(id, options);
			});
			if (isMobile) {
				setUIState({ showSidebar: false });
			}
		},
		[
			activeFileId,
			focusedEditorPane,
			isMobile,
			runAfterContentFlush,
			setFocusedEditorPane,
			setSecondaryFile,
			setUIState,
			splitSecondaryFileId,
			syncFileSelection,
		],
	);

	const handleNavigateInFocusedPane = useCallback(
		(targetId: string, options?: NoteUrlSyncOptions) => {
			if (splitEnabled && focusedEditorPane === "secondary" && splitSecondaryFileId) {
				void runAfterContentFlush(splitSecondaryFileId, () => {
					setSecondaryFile(targetId);
				});
				return;
			}

			void runAfterContentFlush(activeFileId, () => {
				syncFileSelection(targetId, options);
			});
		},
		[
			activeFileId,
			focusedEditorPane,
			runAfterContentFlush,
			setSecondaryFile,
			splitEnabled,
			splitSecondaryFileId,
			syncFileSelection,
		],
	);

	const handleOpenBeside = useCallback(
		(fileId: string) => {
			if (isMobile || !fileId || fileId === activeFileId) return;
			void saveController.flushAll().then(() => {
				openSplitBeside(fileId, activeFileId);
			});
		},
		[activeFileId, isMobile, openSplitBeside, saveController],
	);

	const handleCloseSplit = useCallback(() => {
		const secondaryId = splitSecondaryFileId;
		if (secondaryId) {
			void saveController.flush(secondaryId);
		}
		closeSplit();
	}, [closeSplit, saveController, splitSecondaryFileId]);

	const handleToggleSplit = useCallback(() => {
		if (splitSecondaryFileId) {
			handleCloseSplit();
			return;
		}
		if (!activeFileId || files.length < 2) return;
		const currentIndex = files.findIndex((file) => file.id === activeFileId);
		const neighbor = files[currentIndex + 1] ?? files[currentIndex - 1];
		if (!neighbor || neighbor.id === activeFileId) return;
		handleOpenBeside(neighbor.id);
	}, [activeFileId, files, handleCloseSplit, handleOpenBeside, splitSecondaryFileId]);

	const handleFocusEditorPane = useCallback(
		(pane: EditorPane) => {
			setFocusedEditorPane(pane);
		},
		[setFocusedEditorPane],
	);

	const handleEditorScrollPositionChange = useCallback(
		(fileId: string, scrollTop: number) => {
			setEditorScrollPosition(fileId, scrollTop);
		},
		[setEditorScrollPosition],
	);

	const handleToggleSidebar = useCallback(() => {
		triggerNativeFeedback(showSidebar ? "dismiss" : "selection");
		setUIState({
			showSidebar: !showSidebar,
			...(isMobile && { showMetadata: false }),
		});
	}, [isMobile, showSidebar, setUIState]);

	const handleToggleMetadata = useCallback(() => {
		triggerNativeFeedback(showMetadata ? "dismiss" : "selection");
		setUIState({
			showMetadata: !showMetadata,
			...(isMobile && { showSidebar: false }),
		});
	}, [isMobile, showMetadata, setUIState]);

	useEffect(() => {
		if (
			creationParentFolderId &&
			!foldersQuery.data?.some((folder) => folder.id === creationParentFolderId)
		) {
			setCreationParentFolderId(null);
		}
	}, [creationParentFolderId, foldersQuery.data]);

	const handleCreateFile = useCallback(() => {
		if (diaryModeEnabled) {
			triggerNativeFeedback("success");
			const today = format(new Date(), "yyyy-MM-dd");
			router.push(`/app/journal?date=${today}`);
			if (isMobile) {
				setUIState({ showSidebar: false });
			}
			return;
		}

		triggerNativeFeedback("success");
		const parentId = creationParentFolderId;
		const preferredEditorMode = defaultModeRaw ? "raw" : "block";
		const content = generateNoteContent("Untitled");
		const newFile: CreateNoteInput = {
			id: crypto.randomUUID(),
			name: "Untitled.md",
			content,
			richContent: markdownToRichDocument(content),
			preferredEditorMode,
			parentId,
		};

		if (parentId) {
			setFolderOpen(parentId, true);
		}
		createNoteMutation.mutate(newFile, {
			onSuccess: () => {
				markFileSaved(newFile.id as string);
			},
			onError: () => {
				markFileError(newFile.id as string);
			},
		});
		syncFileSelection(newFile.id as string);
		markFileSaving(newFile.id as string);
		if (isMobile) {
			setUIState({ showSidebar: false });
		}
	}, [
		creationParentFolderId,
		createNoteMutation,
		defaultModeRaw,
		diaryModeEnabled,
		isMobile,
		router,
		markFileError,
		markFileSaved,
		markFileSaving,
		setUIState,
		setFolderOpen,
		syncFileSelection,
	]);

	const handleCreateFolder = useCallback(() => {
		triggerNativeFeedback("impact");
		const parentId = creationParentFolderId;
		const newFolder: CreateFolderInput = {
			id: crypto.randomUUID(),
			name: "Untitled",
			parentId,
		};

		if (parentId) {
			setFolderOpen(parentId, true);
		}
		setFolderOpen(newFolder.id as string, true);
		createFolderMutation.mutate(newFolder);
	}, [createFolderMutation, creationParentFolderId, setFolderOpen]);

	const handleOpenSettings = useCallback(() => {
		triggerNativeFeedback("selection");
		router.push("/app/settings");
	}, [router]);

	const handleToggleEditorMode = useCallback(() => {
		const modeTarget = focusedFile ?? activeFile;
		const modeBaseline = focusedEditorMode ?? editorMode;
		if (!modeTarget || !modeBaseline) return;

		if (isMdxNote(modeTarget)) {
			if (modeTarget.preferredEditorMode !== "raw") {
				void runAfterContentFlush(modeTarget.id, () => {
					markFileSaving(modeTarget.id);
					updateNoteMutation.mutate(
						{
							id: modeTarget.id,
							content: modeTarget.content,
							richContent: modeTarget.richContent,
							preferredEditorMode: "raw",
						},
						{
							onSuccess: () => {
								markFileSaved(modeTarget.id);
							},
							onError: () => {
								markFileError(modeTarget.id);
							},
						},
					);
				});
			}
			return;
		}

		triggerNativeFeedback("impact");
		const nextMode = modeBaseline === "raw" ? "block" : "raw";
		void runAfterContentFlush(modeTarget.id, () => {
			updateNoteMutation.mutate(
				{
					id: modeTarget.id,
					content: modeTarget.content,
					richContent:
						nextMode === "block"
							? markdownToRichDocument(modeTarget.content)
							: modeTarget.richContent,
					preferredEditorMode: nextMode,
				},
				{
					onSuccess: () => {
						markFileSaved(modeTarget.id);
					},
					onError: () => {
						markFileError(modeTarget.id);
					},
				},
			);
			markFileSaving(modeTarget.id);
		});
	}, [
		activeFile,
		editorMode,
		focusedEditorMode,
		focusedFile,
		markFileError,
		markFileSaved,
		markFileSaving,
		runAfterContentFlush,
		updateNoteMutation,
	]);

	const handleOpenCommandPalette = useCallback(() => {
		triggerNativeFeedback("selection");
		setShowCommandPalette(true);
	}, []);

	const handleOpenShortcutHelp = useCallback(() => {
		triggerNativeFeedback("selection");
		setShowShortcutHelp(true);
	}, []);

	const handleDesktopSidebarResizeStart = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (isMobile) return;
			sidebarResizeActiveRef.current = true;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			event.preventDefault();
		},
		[isMobile],
	);

	const closeSidebar = useCallback(() => {
		triggerNativeFeedback("dismiss");
		setUIState({ showSidebar: false });
	}, [setUIState]);

	const closeMetadata = useCallback(() => {
		triggerNativeFeedback("dismiss");
		setUIState({ showMetadata: false });
	}, [setUIState]);

	const handleSidebarDragEnd = useCallback(
		(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
			if (info.offset.x < -52 || info.velocity.x < -SHEET_DISMISS_VELOCITY) {
				closeSidebar();
			}
		},
		[closeSidebar],
	);

	const handleMetadataDragEnd = useCallback(
		(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
			if (info.offset.y > 80 || info.velocity.y > SHEET_DISMISS_VELOCITY) {
				closeMetadata();
			}
		},
		[closeMetadata],
	);

	const handleMetadataDragStart = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (event.pointerType === "mouse" && event.button !== 0) return;

			const target = event.target;
			if (!(target instanceof Element)) return;
			if (target.closest(SHEET_DRAG_BLOCKLIST)) return;

			metadataDragControls.start(event);
		},
		[metadataDragControls],
	);

	const renameFile = useCallback(
		(id: string, name: string) => {
			void runAfterContentFlush(id, () => {
				markFileSaving(id);
				updateNoteMutation.mutate(
					{
						id: id,
						name,
					},
					{
						onSuccess: () => {
							markFileSaved(id);
						},
						onError: () => {
							markFileError(id);
						},
					},
				);
			});
		},
		[markFileError, markFileSaved, markFileSaving, runAfterContentFlush, updateNoteMutation],
	);

	const renameFolder = useCallback(
		(id: string, name: string) => {
			updateFolderMutation.mutate({
				id: id,
				name,
			});
		},
		[updateFolderMutation],
	);

	const deleteFile = useCallback(
		(id: string) => {
			clearFileSaveState(id);
			if (splitSecondaryFileId === id) {
				closeSplit();
			}
			const isDeletingActiveFile = activeFileId === id;
			const currentIndex = files.findIndex((file) => file.id === id);
			const remainingFiles = files.filter((file) => file.id !== id);
			const fallbackFile =
				remainingFiles[Math.min(Math.max(currentIndex, 0), remainingFiles.length - 1)] ??
				null;

			deleteNoteMutation.mutate(id, {
				onError: () => {
					if (isDeletingActiveFile) {
						syncFileSelection(id, { mode: "replace" });
					}
				},
			});

			if (!isDeletingActiveFile) {
				return;
			}

			if (fallbackFile) {
				syncFileSelection(fallbackFile.id, { mode: "replace" });
				return;
			}

			setActiveFileId("");
			clearNoteUrl({ mode: "replace" });
		},
		[
			activeFileId,
			clearFileSaveState,
			closeSplit,
			deleteNoteMutation,
			files,
			setActiveFileId,
			splitSecondaryFileId,
			syncFileSelection,
		],
	);

	const deleteFolder = useCallback(
		(id: string) => {
			deleteFolderMutation.mutate(id);
		},
		[deleteFolderMutation],
	);

	const moveFile = useCallback(
		(fileId: string, newParentId: string | null, sortOrder?: number) => {
			void runAfterContentFlush(fileId, () => {
				updateNoteMutation.mutate({
					id: fileId,
					parentId: newParentId,
					...(sortOrder !== undefined && { sortOrder }),
				});
			});
		},
		[runAfterContentFlush, updateNoteMutation],
	);

	const moveFolder = useCallback(
		(folderId: string, newParentId: string | null, sortOrder?: number) => {
			const descendantIds = new Set<string>();
			const stack = [folderId];

			while (stack.length > 0) {
				const current = stack.pop();
				if (!current) continue;
				descendantIds.add(current);
				for (const folder of folders) {
					if (folder.parentId === current && !descendantIds.has(folder.id)) {
						stack.push(folder.id);
					}
				}
			}

			if (newParentId && descendantIds.has(newParentId)) {
				return;
			}

			updateFolderMutation.mutate({
				id: folderId,
				parentId: newParentId,
				...(sortOrder !== undefined && { sortOrder }),
			});
		},
		[folders, updateFolderMutation],
	);

	const handleToggleFolder = useCallback(
		(id: string) => {
			const currentFolder = folders.find((folder) => folder.id === id);
			setFolderOpen(id, !(currentFolder?.isOpen ?? false));
		},
		[folders, setFolderOpen],
	);

	const getFilesInFolder = useCallback(
		(parentId: string | null) => filesByParentId.get(parentId) ?? [],
		[filesByParentId],
	);

	const getFoldersInFolder = useCallback(
		(parentId: string | null) => foldersByParentId.get(parentId) ?? [],
		[foldersByParentId],
	);

	const countDescendants = useCallback(
		(folderId: string) => descendantCountByFolderId.get(folderId) ?? 0,
		[descendantCountByFolderId],
	);

	const overlayTransition: Transition = prefersReducedMotion
		? { duration: 0.12, ease: "linear" }
		: { duration: 0.2, ease: "easeOut" };

	const sidebarTransition: Transition = prefersReducedMotion
		? { duration: 0.16, ease: "easeOut" }
		: { duration: 0.5, ease: EASE_SHEET };

	const metadataTransition: Transition = prefersReducedMotion
		? { duration: 0.16, ease: "easeOut" }
		: { duration: 0.5, ease: EASE_SHEET };

	useEffect(() => {
		$.setScopes(["notes"]);

		const bindings = [
			$.in("notes").mod.key("k").except("typing").on(handleOpenCommandPalette, {
				preventDefault: true,
				description: "Open the notes command palette",
			}),
			$.in("notes").mod.shift.key("p").except("typing").on(handleOpenCommandPalette, {
				preventDefault: true,
				description: "Open the notes command palette",
			}),
			$.in("notes").mod.key("n").except("typing").on(handleCreateFile, {
				preventDefault: true,
				description: "Create a new note",
			}),
			$.in("notes").mod.shift.key("n").except("typing").on(handleCreateFolder, {
				preventDefault: true,
				description: "Create a new folder",
			}),
			$.in("notes").mod.key("b").except("typing").on(handleToggleSidebar, {
				description: "Toggle the notes sidebar",
			}),
			$.in("notes").mod.shift.key("b").except("typing").on(handleToggleMetadata, {
				description: "Toggle the note details panel",
			}),
			$.in("notes").mod.key("comma").except("typing").on(handleOpenSettings, {
				preventDefault: true,
				description: "Open settings",
			}),
			$.in("notes").mod.key("e").except("typing").on(handleToggleEditorMode, {
				description: "Switch editor mode",
			}),
			$.in("notes").shift.key("slash").except("typing").on(handleOpenShortcutHelp, {
				description: "Open shortcut help",
			}),
		];

		return () => {
			bindings.forEach((binding) => binding.unbind());
		};
	}, [
		$,
		handleCreateFile,
		handleCreateFolder,
		handleOpenCommandPalette,
		handleOpenSettings,
		handleOpenShortcutHelp,
		handleToggleEditorMode,
		handleToggleMetadata,
		handleToggleSidebar,
	]);

	const handleNavigatePrev = useCallback(() => {
		if (!focusedFileIdForNav) return;
		const index = files.findIndex((file) => file.id === focusedFileIdForNav);
		if (index <= 0) return;
		handleNavigateInFocusedPane(files[index - 1]!.id);
	}, [files, focusedFileIdForNav, handleNavigateInFocusedPane]);

	const handleNavigateNext = useCallback(() => {
		if (!focusedFileIdForNav) return;
		const index = files.findIndex((file) => file.id === focusedFileIdForNav);
		if (index < 0 || index >= files.length - 1) return;
		handleNavigateInFocusedPane(files[index + 1]!.id);
	}, [files, focusedFileIdForNav, handleNavigateInFocusedPane]);

	const commandItems: CommandPaletteItem[] = useMemo(
		() => [
			{
				id: "new-note",
				label: diaryModeEnabled ? "Open today's journal" : "Create note",
				shortcut: "mod+n",
				keywords: diaryModeEnabled
					? ["journal", "today", "entry", "create", "new"]
					: ["new", "file", "note", "create"],
				description: diaryModeEnabled
					? "Open today's journal entry."
					: "Create a fresh note and focus it immediately.",
				action: handleCreateFile,
			},
			{
				id: "new-folder",
				label: "Create folder",
				shortcut: "mod+shift+n",
				keywords: ["folder", "create", "sidebar"],
				description: "Add a new folder to the current tree.",
				action: handleCreateFolder,
			},
			{
				id: "toggle-sidebar",
				label: "Toggle sidebar",
				shortcut: "mod+b",
				keywords: ["sidebar", "navigation", "panel"],
				description: "Show or hide the notes navigation panel.",
				action: handleToggleSidebar,
			},
			{
				id: "toggle-metadata",
				label: "Toggle note details",
				shortcut: "mod+shift+b",
				keywords: ["metadata", "details", "properties"],
				description: "Show or hide the metadata panel.",
				action: handleToggleMetadata,
			},
			{
				id: "toggle-editor-mode",
				label: "Toggle editor surface",
				shortcut: "mod+e",
				keywords: ["raw mdx", "block note", "editor"],
				description: "Swap between raw MDX and Block Note.",
				action: handleToggleEditorMode,
			},
			{
				id: "open-settings",
				label: "Open settings",
				shortcut: "mod+comma",
				keywords: ["settings", "preferences"],
				description: "Open the settings modal.",
				action: handleOpenSettings,
			},
			{
				id: "open-journal",
				label: "Go to journal",
				keywords: ["journal", "route", "navigate"],
				description: "Jump from notes into the journal view.",
				action: () => router.push("/app/journal"),
			},
		],
		[
			handleCreateFile,
			handleCreateFolder,
			diaryModeEnabled,
			handleOpenSettings,
			handleToggleEditorMode,
			handleToggleMetadata,
			handleToggleSidebar,
			router,
		],
	);

	// The sidebar + main layout only need the notes metadata and folder lists,
	// which are prefetched on the server. They MUST NOT depend on the active
	// note query — otherwise clicking another note flips this to `false` while
	// the new note is fetched, replacing the whole UI with skeletons.
	const hasSidebarData =
		notesQuery.data !== undefined && foldersQuery.data !== undefined;
	const isEditorReady =
		hasSidebarData || (!notesQuery.isPending && !foldersQuery.isPending);
	// Separate flag for "we're swapping to a note whose content has never
	// been fetched". `activeNote` is null only while the detail query has no
	// data for the selected id (true first fetch); cached or prefetched notes
	// resolve on the same commit, so this stays false and the editor is never
	// torn down for an already-loaded note.
	const isActiveNoteLoading =
		Boolean(activeFileId) && files.some((file) => file.id === activeFileId) && !activeNote;
	const treeActions = useMemo<NoteTreeActions>(
		() => ({
			onFileSelect: handleFileSelect,
			onOpenBeside: !isMobile ? handleOpenBeside : undefined,
			onFilePrefetch: prefetchNote,
			onToggleFolder: handleToggleFolder,
			onRenameFile: renameFile,
			onRenameFolder: renameFolder,
			onDeleteFile: deleteFile,
			onDeleteFolder: deleteFolder,
			onMoveFile: moveFile,
			onMoveFolder: moveFolder,
		}),
		[
			handleFileSelect,
			handleOpenBeside,
			isMobile,
			prefetchNote,
			handleToggleFolder,
			renameFile,
			renameFolder,
			deleteFile,
			deleteFolder,
			moveFile,
			moveFolder,
		],
	);

	const treeQueries = useMemo<NoteTreeQueries>(
		() => ({ getFilesInFolder, getFoldersInFolder, countDescendants }),
		[getFilesInFolder, getFoldersInFolder, countDescendants],
	);

	const sidebarPanelProps = {
		files,
		folders,
		filesById,
		foldersById,
		activeFileId,
		isFilesLoading: notesQuery.isFetching && files.length === 0,
		actions: treeActions,
		queries: treeQueries,
		onCollapseAllFolders: () => collapseAllFolders(folders.map((folder) => folder.id)),
		onExpandAllFolders: () => expandAllFolders(folders.map((folder) => folder.id)),
		onCreateFile: handleCreateFile,
		onCreateFolder: handleCreateFolder,
		onCreationParentChange: setCreationParentFolderId,
	};

	return {
		activeFile,
		focusedFile,
		secondaryFile,
		splitEnabled,
		focusedEditorPane,
		editorScrollPositions,
		splitOrientation,
		splitSecondaryFirst,
		secondaryEditorMode,
		focusedEditorMode,
		activeFileId,
		activeFileSaveState,
		canNavigateNext,
		canNavigatePrev,
		closeMetadata,
		closeSidebar,
		collapseAllFolders: () => collapseAllFolders(folders.map((folder) => folder.id)),
		commandItems,
		countDescendants,
		createFile: handleCreateFile,
		createFolder: handleCreateFolder,
		editorMode,
		expandAllFolders: () => expandAllFolders(folders.map((folder) => folder.id)),
		files,
		getFilesInFolder,
		getFoldersInFolder,
		handleDesktopSidebarResizeStart,
		handleFileSelect,
		handleMetadataDragEnd,
		handleMetadataDragStart,
		handleSidebarDragEnd,
		handleNavigateNext,
		handleNavigatePrev,
		handleOpenCommandPalette,
		handleOpenSettings,
		handleOpenShortcutHelp,
		handleToggleEditorMode,
		handleToggleMetadata,
		handleToggleSidebar,
		handleToggleFolder,
		isActiveNoteLoading,
		isEditorReady,
		isMobile,
		metadataDragControls,
		metadataTransition,
		moveFile,
		moveFolder,
		overlayTransition,
		prefersReducedMotion,
		renameFile,
		renameFolder,
		setShowCommandPalette,
		setShowShortcutHelp,
		sidebarPanelProps,
		sidebarRef,
		sidebarTransition,
		sidebarWidth,
		showCommandPalette,
		showMetadata,
		showShortcutHelp,
		showSidebar,
		shortcutGroups: NOTES_SHORTCUT_GROUPS,
		flushFileEdits: handleFlushFileEdits,
		updateFileContent: handleUpdateFileContent,
		viewingVersion,
		handleViewVersion,
		handleExitVersionPreview,
		handleRestoreViewedVersion,
		isRestoringVersion: restoreNoteVersion.isPending,
		sharingNoteId,
		handleOpenShare,
		handleCloseShare,
		handleCloseSplit,
		handleEditorScrollPositionChange,
		handleFocusEditorPane,
		handleOpenBeside,
		handleToggleSplit,
		handleToggleSplitOrientation: toggleSplitOrientation,
		handleSwapSplitPaneOrder: swapSplitPaneOrder,
		canToggleSplit: files.length > 1 && Boolean(activeFileId) && !isMobile,
	};
}
