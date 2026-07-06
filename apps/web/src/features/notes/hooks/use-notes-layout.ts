"use client";

import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { type PanInfo } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";
import type { CreateFolderInput } from "@/domain/folders/actions";
import { collectFolderSubtreeIds } from "@/domain/folders/traversal";
import type { CreateNoteInput } from "@/domain/notes/note-write-core";
import { NOTE_PROPERTY_TEMPLATES } from "@/domain/notes/properties";
import { NOTE_TEMPLATES, getNoteTemplate } from "@/domain/notes/templates";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { isTauriRuntime, useWorkspaceBackend } from "@/core/workspace-backend";
import { isGuestScopedId } from "@/domain/notes/note-id";
import { isMdxNote, resolveEditorMode } from "@/features/editor/lib/editor-mode";
import { VIM_COMMAND_EVENT } from "@/features/editor/lib/vim-command-bus";
import { generateNoteContent } from "@/features/notes/lib/generate-note-content";
import { buildNoteIndexes } from "@/features/notes/lib/note-indexes";
import { applyFolderUiState, useNotesStore, type EditorPane } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { openSettings } from "@/features/settings/use-settings-modal";
import {
	focusActiveEditor,
	focusActiveMetadataPanel,
	focusActiveNoteTreeItem,
	focusSplitEditorPane,
} from "@/shared/lib/focus-editor";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { perf } from "@/shared/perf/track";
import type { CommandPaletteItem } from "@/shared/ui/command-palette";
import {
	useRegisterCommands,
	useRegisterCommandItemsProvider,
	useActiveCommandScope,
	useCommandRegistry,
} from "@/core/commands";
import { parseCommandQuery } from "@/shared/ui/command-palette-model";
import type { NoteFile, NoteVersion } from "@/types/notes";
import type { NoteTreeActions, NoteTreeQueries } from "../lib/tree-actions";
import { useCreateFolder } from "./use-create-folder";
import { useCreateNote } from "./use-create-note";
import { useDesktopMenuActions } from "./use-desktop-menu-actions";
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
import { useNotesLayoutSaveController } from "./use-notes-layout-save-controller";
import { useNotesLayoutShortcuts } from "./use-notes-layout-shortcuts";
import { useNoteSearch, type NoteSearchHit } from "./use-note-search";
import { useNotesLayoutViewport } from "./use-notes-layout-viewport";
import { useRestoreNoteVersion } from "./use-restore-note-version";
import { useUpdateFolder } from "./use-update-folder";
import { useUpdateNote } from "./use-update-note";

const SHEET_DISMISS_VELOCITY = 480;
const SHEET_DRAG_BLOCKLIST =
	"button, a, input, textarea, select, option, [role='button'], [role='tab'], [contenteditable='true'], [data-sheet-no-drag]";

function sameTabList(
	a: ReadonlyArray<{ fileId: string; pinned: boolean }>,
	b: ReadonlyArray<{ fileId: string; pinned: boolean }>,
): boolean {
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index += 1) {
		if (a[index]!.fileId !== b[index]!.fileId || a[index]!.pinned !== b[index]!.pinned) {
			return false;
		}
	}
	return true;
}

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
	const searchParams = useSearchParams();
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
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
	const setSplitOrientation = useNotesStore((state) => state.setSplitOrientation);
	const toggleSplitOrientation = useNotesStore((state) => state.toggleSplitOrientation);
	const swapSplitPaneOrder = useNotesStore((state) => state.swapSplitPaneOrder);
	const setSplitSecondaryFirst = useNotesStore((state) => state.setSplitSecondaryFirst);
	const primaryTabs = useNotesStore((state) => state.primaryTabs);
	const secondaryTabs = useNotesStore((state) => state.secondaryTabs);
	const reorderTabs = useNotesStore((state) => state.reorderTabs);
	const addTab = useNotesStore((state) => state.addTab);
	const openTabInBackground = useNotesStore((state) => state.openTabInBackground);
	const removeTab = useNotesStore((state) => state.removeTab);
	const togglePinTab = useNotesStore((state) => state.togglePinTab);
	const setPaneTabs = useNotesStore((state) => state.setPaneTabs);
	const closeOtherTabs = useNotesStore((state) => state.closeOtherTabs);
	const closeTabsToSide = useNotesStore((state) => state.closeTabsToSide);
	const closeAllTabs = useNotesStore((state) => state.closeAllTabs);
	const secondaryNoteQuery = useNote(splitSecondaryFileId ?? "");
	const folderOpenState = useNotesStore((state) => state.folderOpenState);
	const activeFileSaveState = useNotesStore((state) =>
		state.getFileSaveState(state.activeFileId || seededActiveFileId),
	);
	const setActiveFileId = useNotesStore((state) => state.setActiveFileId);
	// The one-time seed only wins while the store is empty, so an in-app
	// navigation to `/app?note=X` (graph node click, tag insights link) would
	// be ignored once another note is already active. Follow the URL param as
	// a live request instead.
	const requestedNoteId = searchParams.get("note");
	useEffect(() => {
		if (!requestedNoteId) return;
		if (initialUserScopeId && isGuestScopedId(requestedNoteId)) return;
		if (useNotesStore.getState().activeFileId !== requestedNoteId) {
			setActiveFileId(requestedNoteId);
		}
	}, [requestedNoteId, initialUserScopeId, setActiveFileId]);
	const recentFileIds = useNotesStore((state) => state.recentFileIds);
	const lastActiveFileId = useNotesStore((state) => state.lastActiveFileId);
	const pushRecentFile = useNotesStore((state) => state.pushRecentFile);
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
	const {
		handleUpdateFileContent,
		handleFlushFileEdits,
		runAfterContentFlush,
		flushContentInBackground,
		flushAllContent,
		discardPending,
		markFileSaving,
		markFileSaved,
		markFileError,
	} = useNotesLayoutSaveController({
		activeFileId,
		initialUserScopeId,
		seededActiveFileId,
		setActiveFileId,
		setFileSaveState,
		clearFileSaveState,
	});
	const metadataFiles = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
	const activeNote = activeNoteQuery.isPlaceholderData ? null : (activeNoteQuery.data ?? null);
	const secondaryNote = secondaryNoteQuery.isPlaceholderData
		? null
		: (secondaryNoteQuery.data ?? null);
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
	const setMetadataWidth = useNotesStore((state) => state.setMetadataWidth);
	const { showSidebar, showMetadata, sidebarWidth, metadataWidth, isMobile } = ui;

	const initializePreferences = usePreferencesStore((state) => state.initialize);
	const defaultModeRaw = usePreferencesStore((state) => state.editor.defaultModeRaw);
	const openNotesInTabs = usePreferencesStore((state) => state.editor.openNotesInTabs);
	const defaultPropertiesTemplateId = usePreferencesStore(
		(state) => state.editor.notePropertiesDefaultTemplateId,
	);
	const diaryModeEnabled = usePreferencesStore((state) => state.journal.diaryModeEnabled);
	const rememberLastNote = usePreferencesStore((state) => state.appearance.rememberLastNote);
	const [viewingVersion, setViewingVersion] = useState<NoteVersion | null>(null);
	const [sharingNoteId, setSharingNoteId] = useState<string | null>(null);
	const restoreNoteVersion = useRestoreNoteVersion();
	const {
		prefersReducedMotion,
		metadataDragControls,
		metadataRef,
		sidebarRef,
		closeSidebar,
		closeMetadata,
		handleDesktopMetadataResizeStart,
		handleDesktopSidebarResizeStart,
		isMetadataResizing,
		isSidebarResizing,
		overlayTransition,
		sidebarTransition,
		metadataTransition,
	} = useNotesLayoutViewport({
		isMobile,
		showSidebar,
		showMetadata,
		setUIState,
		setSidebarWidth,
		setMetadataWidth,
	});
	const {
		filesById,
		foldersById,
		filesByParentId,
		foldersByParentId,
		descendantCountByFolderId,
	} = useMemo(
		// Index from metadata only: the sidebar tree never reads note content, and
		// metadataFiles is referentially stable across content edits — so the
		// memoized FileList stops re-rendering on every keystroke. The editor still
		// gets the content-merged `files` below.
		() => buildNoteIndexes(metadataFiles, folders, activeFileId),
		[metadataFiles, folders, activeFileId],
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

	// Tabs are a desktop-only, client-only enhancement. Gating `openInTabs` on a
	// mount flag keeps the server render and first client render identical (no
	// tab bar) so the persisted tab state can't cause a hydration mismatch.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);
	// Tab mode is on when the user enabled the preference, or on demand once a note
	// is opened in a new tab (background open). Without the preference we only show
	// the bar at 2+ tabs so closing back down to a single note hides it again
	// instead of stranding a lone-tab bar.
	const openInTabs =
		mounted &&
		(openNotesInTabs || primaryTabs.length > 1 || secondaryTabs.length > 1) &&
		!isMobile;

	const fileById = useMemo(() => {
		const map = new Map<string, NoteFile>();
		for (const file of files) map.set(file.id, file);
		return map;
	}, [files]);

	const resolveTabItems = useCallback(
		(tabs: typeof primaryTabs) =>
			tabs
				.map((tab) => {
					const file = fileById.get(tab.fileId);
					return file ? { file, pinned: tab.pinned } : null;
				})
				.filter((item): item is { file: NoteFile; pinned: boolean } => item !== null),
		[fileById],
	);

	const primaryTabItems = useMemo(
		() => resolveTabItems(primaryTabs),
		[primaryTabs, resolveTabItems],
	);
	const secondaryTabItems = useMemo(
		() => resolveTabItems(secondaryTabs),
		[secondaryTabs, resolveTabItems],
	);

	// Warm the detail cache for a note before it is opened. `useNote` keeps
	// fetched notes fresh forever (staleTime: Infinity), so a single prefetch
	// turns the eventual click into an instant, skeleton-free swap.
	const prefetchNote = useCallback(
		(id: string) => {
			if (!id) return;
			if (backend.mode === "server" && isGuestScopedId(id)) return;
			if (queryClient.getQueryData(notesKeys.detail(id)) !== undefined) return;
			void queryClient.prefetchQuery({
				queryKey: notesKeys.detail(id),
				queryFn: () => backend.getNote(id),
				staleTime: Number.POSITIVE_INFINITY,
			});
		},
		[backend, queryClient],
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

	// On the desktop (Tauri) build, an empty workspace has no active note, so the
	// metadata panel has nothing to show. Collapse it once on the first settled
	// load so the editor opens full-width; the user can re-open it (mod+shift+alt+b)
	// without it snapping shut again.
	const didCollapseDesktopMetadata = useRef(false);
	useEffect(() => {
		if (didCollapseDesktopMetadata.current) return;
		if (isMobile || notesQuery.isPending) return;
		didCollapseDesktopMetadata.current = true;
		if (isTauriRuntime() && files.length === 0) {
			setUIState({ showMetadata: false });
		}
	}, [files.length, isMobile, notesQuery.isPending, setUIState]);

	useEffect(() => {
		initializePreferences();
	}, [initializePreferences]);

	const didInitialAutoSelect = useRef(false);
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

		// On the very first resolve, restore the note the user last viewed
		// (instead of the server-seeded first note) when they opted in and the
		// URL isn't already pointing at a specific note.
		if (
			!didInitialAutoSelect.current &&
			!requestedNoteId &&
			rememberLastNote &&
			lastActiveFileId &&
			lastActiveFileId !== activeFileId &&
			files.some((file) => file.id === lastActiveFileId)
		) {
			didInitialAutoSelect.current = true;
			syncFileSelection(lastActiveFileId, { mode: "replace" });
			return;
		}

		if (activeFileId) {
			if (files.some((file) => file.id === activeFileId)) {
				didInitialAutoSelect.current = true;
				return;
			}
			// The open note was deleted/renamed out of existence — fall back to
			// the first note so the editor never points at a stale id.
			didInitialAutoSelect.current = true;
			syncFileSelection(files[0].id, { mode: "replace" });
			return;
		}

		// No note is selected. Auto-open the first note only on the very first
		// load; once the user has deliberately closed everything, honor the
		// empty state instead of re-opening a note behind their back.
		if (!didInitialAutoSelect.current) {
			didInitialAutoSelect.current = true;
			syncFileSelection(files[0].id, { mode: "replace" });
		}
	}, [
		activeFileId,
		files,
		notesQuery.isPending,
		setActiveFileId,
		syncFileSelection,
		requestedNoteId,
		rememberLastNote,
		lastActiveFileId,
	]);

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

	// Warm the neighbours of the active note so prev/next keyboard navigation
	// resolves from cache instead of fetching (and flashing a skeleton).
	useEffect(() => {
		if (!activeFileId) return;
		const index = files.findIndex((file) => file.id === activeFileId);
		if (index === -1) return;
		prefetchNote(files[index - 1]?.id ?? "");
		prefetchNote(files[index + 1]?.id ?? "");
	}, [activeFileId, files, prefetchNote]);

	const handleViewVersion = useCallback(
		(version: NoteVersion) => {
			void runAfterContentFlush(version.noteId, () => {
				setSharingNoteId(null);
				setViewingVersion(version);
			});
		},
		[runAfterContentFlush],
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
		discardPending(viewingVersion.noteId);
		restoreNoteVersion.mutate(viewingVersion.id, {
			onSuccess: () => {
				setViewingVersion(null);
			},
		});
	}, [discardPending, restoreNoteVersion, viewingVersion]);

	const handleFileSelect = useCallback(
		(id: string, options?: NoteUrlSyncOptions) => {
			triggerNativeFeedback("selection");

			if (id) {
				pushRecentFile(id);
			}

			// Start the select→painted timer (warm = body already cached).
			if (id && id !== activeFileId) {
				perf.openStart(id, queryClient.getQueryData(notesKeys.detail(id)) !== undefined);
			}

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
					flushContentInBackground(splitSecondaryFileId);
					setSecondaryFile(id);
				} else {
					flushContentInBackground(activeFileId);
					syncFileSelection(id, options);
				}

				if (isMobile) {
					setUIState({ showSidebar: false });
				}
				return;
			}

			flushContentInBackground(activeFileId);
			syncFileSelection(id, options);
			if (isMobile) {
				setUIState({ showSidebar: false });
			}
		},
		[
			activeFileId,
			flushContentInBackground,
			focusedEditorPane,
			isMobile,
			pushRecentFile,
			queryClient,
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
				flushContentInBackground(splitSecondaryFileId);
				setSecondaryFile(targetId);
				return;
			}

			flushContentInBackground(activeFileId);
			syncFileSelection(targetId, options);
		},
		[
			activeFileId,
			flushContentInBackground,
			focusedEditorPane,
			setSecondaryFile,
			splitEnabled,
			splitSecondaryFileId,
			syncFileSelection,
		],
	);

	const handleOpenBeside = useCallback(
		(fileId: string) => {
			if (isMobile || !fileId || fileId === activeFileId) return;
			flushAllContent({ createCheckpoint: true });
			openSplitBeside(fileId, activeFileId);
		},
		[activeFileId, flushAllContent, isMobile, openSplitBeside],
	);

	const handleOpenInSplit = useCallback(
		(
			fileId: string,
			orientation: "vertical" | "horizontal",
			placement: "before" | "after" = "after",
		) => {
			if (isMobile || !fileId || fileId === activeFileId) return;
			setSplitOrientation(orientation);
			setSplitSecondaryFirst(placement === "before");
			handleOpenBeside(fileId);
		},
		[activeFileId, handleOpenBeside, isMobile, setSplitOrientation, setSplitSecondaryFirst],
	);

	// Open a note as a background tab (middle-click in the sidebar, ctrl/cmd-click
	// a wikilink): it appears as a new tab in the focused pane without stealing
	// focus from the current note. Forces tab mode on if it was off.
	const handleOpenInNewTab = useCallback(
		(fileId: string) => {
			if (isMobile || !fileId) return;
			const pane = splitEnabled ? focusedEditorPane : "primary";
			openTabInBackground(pane, fileId);
			prefetchNote(fileId);
		},
		[focusedEditorPane, isMobile, openTabInBackground, prefetchNote, splitEnabled],
	);

	const handleCloseSplit = useCallback(() => {
		const secondaryId = splitSecondaryFileId;
		if (secondaryId) {
			handleFlushFileEdits(secondaryId);
		}
		closeSplit();
	}, [closeSplit, handleFlushFileEdits, splitSecondaryFileId]);

	const handleOpenSplitWithOrientation = useCallback(
		(orientation: "vertical" | "horizontal") => {
			if (splitSecondaryFileId) {
				setSplitOrientation(orientation);
				return;
			}
			if (!activeFileId || files.length < 2) return;
			const currentIndex = files.findIndex((file) => file.id === activeFileId);
			const neighbor = files[currentIndex + 1] ?? files[currentIndex - 1];
			if (!neighbor || neighbor.id === activeFileId) return;
			setSplitOrientation(orientation);
			handleOpenBeside(neighbor.id);
		},
		[activeFileId, files, handleOpenBeside, setSplitOrientation, splitSecondaryFileId],
	);

	const restoreEditorFocusAfterLayoutChange = useCallback(() => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (!focusSplitEditorPane(focusedEditorPane)) {
					focusActiveEditor();
				}
			});
		});
	}, [focusedEditorPane]);

	const handleToggleSplit = useCallback(() => {
		if (splitSecondaryFileId && splitOrientation === "vertical") {
			handleCloseSplit();
		} else {
			handleOpenSplitWithOrientation("vertical");
		}
		restoreEditorFocusAfterLayoutChange();
	}, [
		handleCloseSplit,
		handleOpenSplitWithOrientation,
		restoreEditorFocusAfterLayoutChange,
		splitOrientation,
		splitSecondaryFileId,
	]);

	const handleSplitHorizontal = useCallback(() => {
		if (splitSecondaryFileId && splitOrientation === "horizontal") {
			handleCloseSplit();
		} else {
			handleOpenSplitWithOrientation("horizontal");
		}
		restoreEditorFocusAfterLayoutChange();
	}, [
		handleCloseSplit,
		handleOpenSplitWithOrientation,
		restoreEditorFocusAfterLayoutChange,
		splitOrientation,
		splitSecondaryFileId,
	]);

	function handleCloseSplitPane() {
		if (!splitSecondaryFileId) return;
		handleCloseSplit();
		restoreEditorFocusAfterLayoutChange();
	}

	const handleFocusFileTree = useCallback(() => {
		triggerNativeFeedback("selection");
		if (!showSidebar) {
			setUIState({ showSidebar: true });
		}
		const targetId = focusedEditorPane === "secondary" ? splitSecondaryFileId : activeFileId;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				focusActiveNoteTreeItem(targetId ?? undefined);
			});
		});
	}, [activeFileId, focusedEditorPane, setUIState, showSidebar, splitSecondaryFileId]);

	const handleFocusMetadata = useCallback(() => {
		triggerNativeFeedback("selection");
		if (!showMetadata) {
			setUIState({ showMetadata: true });
		}
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				focusActiveMetadataPanel();
			});
		});
	}, [setUIState, showMetadata]);

	const handleFocusSplitPane = useCallback(
		(direction: 1 | -1) => {
			if (!splitSecondaryFileId) return;
			const panes: EditorPane[] = splitSecondaryFirst
				? ["secondary", "primary"]
				: ["primary", "secondary"];
			const currentIndex = panes.indexOf(focusedEditorPane);
			const nextIndex =
				currentIndex === -1 ? 0 : (currentIndex + direction + panes.length) % panes.length;
			const nextPane = panes[nextIndex] ?? "primary";
			setFocusedEditorPane(nextPane);
			requestAnimationFrame(() => {
				focusSplitEditorPane(nextPane);
			});
		},
		[focusedEditorPane, setFocusedEditorPane, splitSecondaryFileId, splitSecondaryFirst],
	);

	const handleFocusNextSplitPane = useCallback(() => {
		handleFocusSplitPane(1);
	}, [handleFocusSplitPane]);

	const handleFocusPreviousSplitPane = useCallback(() => {
		handleFocusSplitPane(-1);
	}, [handleFocusSplitPane]);

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

	// Keep each pane's tab list aligned with reality: drop tabs whose note no
	// longer exists, and guarantee the pane's active note is always present. The
	// "ensure active" step is what makes opening a note accumulate a tab without
	// any explicit add call in the selection path.
	useEffect(() => {
		if (!openInTabs || notesQuery.isPending) return;

		function reconcile(tabs: typeof primaryTabs, ensureId: string | null): typeof primaryTabs {
			const pruned = tabs.filter((tab) => fileById.has(tab.fileId));
			if (
				ensureId &&
				fileById.has(ensureId) &&
				!pruned.some((tab) => tab.fileId === ensureId)
			) {
				return [...pruned, { fileId: ensureId, pinned: false }];
			}
			return pruned;
		}

		const nextPrimary = reconcile(primaryTabs, activeFileId || null);
		if (!sameTabList(nextPrimary, primaryTabs)) {
			setPaneTabs("primary", nextPrimary);
		}

		if (splitEnabled && splitSecondaryFileId) {
			const nextSecondary = reconcile(secondaryTabs, splitSecondaryFileId);
			if (!sameTabList(nextSecondary, secondaryTabs)) {
				setPaneTabs("secondary", nextSecondary);
			}
		}
	}, [
		openInTabs,
		notesQuery.isPending,
		fileById,
		primaryTabs,
		secondaryTabs,
		activeFileId,
		splitEnabled,
		splitSecondaryFileId,
		setPaneTabs,
	]);

	const activateTab = useCallback(
		(pane: EditorPane, fileId: string) => {
			if (pane === "secondary") {
				if (!fileId || fileId === splitSecondaryFileId) return;
				flushContentInBackground(splitSecondaryFileId ?? "");
				setSecondaryFile(fileId);
				return;
			}
			if (!fileId || fileId === activeFileId) return;
			flushContentInBackground(activeFileId);
			syncFileSelection(fileId);
		},
		[
			activeFileId,
			flushContentInBackground,
			setSecondaryFile,
			splitSecondaryFileId,
			syncFileSelection,
		],
	);

	const handleSwitchToTabIndex = useCallback(
		(index: number) => {
			const tabs = focusedEditorPane === "secondary" ? secondaryTabs : primaryTabs;
			if (tabs.length === 0) return;
			const target = index < 0 ? tabs[tabs.length - 1] : tabs[index];
			if (!target) return;
			activateTab(focusedEditorPane, target.fileId);
		},
		[activateTab, focusedEditorPane, primaryTabs, secondaryTabs],
	);

	const handleCloseTab = useCallback(
		(pane: EditorPane, fileId: string) => {
			const tabs = pane === "primary" ? primaryTabs : secondaryTabs;
			const paneActiveId = pane === "primary" ? activeFileId : splitSecondaryFileId;
			flushContentInBackground(fileId);

			if (fileId !== paneActiveId) {
				removeTab(pane, fileId);
				return;
			}

			const index = tabs.findIndex((tab) => tab.fileId === fileId);
			const neighbor = tabs[index + 1]?.fileId ?? tabs[index - 1]?.fileId ?? null;
			removeTab(pane, fileId);

			if (neighbor) {
				activateTab(pane, neighbor);
			} else if (pane === "secondary") {
				closeSplit();
			} else {
				setActiveFileId("");
				clearNoteUrl({ mode: "replace" });
			}
		},
		[
			activeFileId,
			activateTab,
			closeSplit,
			flushContentInBackground,
			primaryTabs,
			removeTab,
			secondaryTabs,
			setActiveFileId,
			splitSecondaryFileId,
		],
	);

	const handleReorderTabs = useCallback(
		(pane: EditorPane, orderedFileIds: string[]) => {
			reorderTabs(pane, orderedFileIds);
		},
		[reorderTabs],
	);

	const handleTogglePinTab = useCallback(
		(pane: EditorPane, fileId: string) => {
			togglePinTab(pane, fileId);
		},
		[togglePinTab],
	);

	const handleCloseOtherTabs = useCallback(
		(pane: EditorPane, fileId: string) => {
			const removed = closeOtherTabs(pane, fileId);
			removed.forEach((id) => flushContentInBackground(id));
			activateTab(pane, fileId);
		},
		[activateTab, closeOtherTabs, flushContentInBackground],
	);

	const handleCloseTabsToSide = useCallback(
		(pane: EditorPane, fileId: string, side: "left" | "right") => {
			const removed = closeTabsToSide(pane, fileId, side);
			removed.forEach((id) => flushContentInBackground(id));
			const paneActiveId = pane === "primary" ? activeFileId : splitSecondaryFileId;
			if (paneActiveId && removed.includes(paneActiveId)) {
				activateTab(pane, fileId);
			}
		},
		[
			activateTab,
			activeFileId,
			closeTabsToSide,
			flushContentInBackground,
			splitSecondaryFileId,
		],
	);

	const handleDropNoteOnTab = useCallback(
		(pane: EditorPane, targetFileId: string | null, droppedFileId: string) => {
			if (!droppedFileId || droppedFileId === targetFileId) return;
			const tabs = pane === "primary" ? primaryTabs : secondaryTabs;
			const alreadyOpen = tabs.some((tab) => tab.fileId === droppedFileId);
			if (!alreadyOpen) {
				const target = targetFileId
					? tabs.find((tab) => tab.fileId === targetFileId)
					: undefined;
				if (target) {
					flushContentInBackground(target.fileId);
					setPaneTabs(
						pane,
						tabs.map((tab) =>
							tab.fileId === target.fileId
								? { fileId: droppedFileId, pinned: tab.pinned }
								: tab,
						),
					);
				} else {
					addTab(pane, droppedFileId);
				}
			}
			activateTab(pane, droppedFileId);
		},
		[activateTab, addTab, flushContentInBackground, primaryTabs, secondaryTabs, setPaneTabs],
	);

	const focusedPaneActiveId = useCallback(
		() => (focusedEditorPane === "secondary" ? splitSecondaryFileId : activeFileId),
		[activeFileId, focusedEditorPane, splitSecondaryFileId],
	);

	const handleCloseFocusedTab = useCallback(() => {
		const id = focusedPaneActiveId();
		if (id) {
			handleCloseTab(focusedEditorPane, id);
			return;
		}
		if (splitSecondaryFileId) {
			handleCloseSplit();
			restoreEditorFocusAfterLayoutChange();
			return;
		}
		if (activeFileId) {
			handleCloseTab("primary", activeFileId);
		}
	}, [
		activeFileId,
		focusedEditorPane,
		focusedPaneActiveId,
		handleCloseSplit,
		handleCloseTab,
		restoreEditorFocusAfterLayoutChange,
		splitSecondaryFileId,
	]);

	// Vim ex commands from the block editor (`:w`, `:q`, `:wq`, `:x`, and their
	// `!` variants). `:w` flushes every dirty note with a checkpoint; quitting
	// maps to vim window semantics — close the focused tab, or the split pane
	// when it is the last one.
	useEffect(() => {
		function onVimCommand(event: Event) {
			const command = (event as CustomEvent<{ command?: string }>).detail?.command;
			if (!command) return;
			const base = command.replace(/!$/, "");
			const save = base === "w" || base === "wq" || base === "x";
			const quit = base === "q" || base === "wq" || base === "x";
			if (save) flushAllContent({ createCheckpoint: true });
			if (quit) handleCloseFocusedTab();
		}
		window.addEventListener(VIM_COMMAND_EVENT, onVimCommand);
		return () => window.removeEventListener(VIM_COMMAND_EVENT, onVimCommand);
	}, [flushAllContent, handleCloseFocusedTab]);

	const handleCloseFocusedOtherTabs = useCallback(() => {
		const id = focusedPaneActiveId();
		if (!id) return;
		handleCloseOtherTabs(focusedEditorPane, id);
	}, [focusedEditorPane, focusedPaneActiveId, handleCloseOtherTabs]);

	const handleCloseAllTabs = useCallback(() => {
		const pane = focusedEditorPane;
		const tabs = pane === "secondary" ? secondaryTabs : primaryTabs;
		const removed = closeAllTabs(pane);
		removed.forEach((id) => flushContentInBackground(id));
		const firstPinned = tabs.find((tab) => tab.pinned)?.fileId ?? null;
		if (firstPinned) {
			activateTab(pane, firstPinned);
		} else if (pane === "secondary") {
			closeSplit();
		} else {
			setActiveFileId("");
			clearNoteUrl({ mode: "replace" });
		}
	}, [
		activateTab,
		clearNoteUrl,
		closeAllTabs,
		closeSplit,
		flushContentInBackground,
		focusedEditorPane,
		primaryTabs,
		secondaryTabs,
		setActiveFileId,
	]);

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

	const handleCreateFile = useCallback(
		(options?: { projectId?: string; templateId?: string }) => {
			const projectId = options?.projectId;
			const template = options?.templateId ? getNoteTemplate(options.templateId) : null;
			if (diaryModeEnabled && !projectId && !template) {
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
			const templateBody = template?.build();
			const name = templateBody?.name ?? "Untitled.md";
			const content = templateBody?.content ?? generateNoteContent("Untitled");
			const richContent = markdownToRichDocument(content);
			const defaultTemplate = defaultPropertiesTemplateId
				? NOTE_PROPERTY_TEMPLATES.find(
						(template) => template.id === defaultPropertiesTemplateId,
					)
				: null;
			const properties = defaultTemplate?.build() ?? [];
			const newId = crypto.randomUUID();
			const newFile: CreateNoteInput = {
				id: newId,
				name,
				content,
				richContent,
				preferredEditorMode,
				parentId,
				properties,
			};

			// Seed the detail cache synchronously, before selecting the note.
			// Otherwise selecting it mounts useNote(newId), which fires fetchNote()
			// for an id the server hasn't committed yet, gets null back, and — with
			// staleTime: Infinity / retry: false — sticks on null forever, trapping
			// the editor behind the loading skeleton until a manual refresh.
			queryClient.setQueryData<NoteFile>(notesKeys.detail(newId), {
				id: newId,
				name: newFile.name,
				content,
				richContent,
				preferredEditorMode,
				createdAt: new Date(),
				modifiedAt: new Date(),
				parentId: parentId ?? null,
				tags: [],
				properties,
			});

			if (parentId) {
				setFolderOpen(parentId, true);
			}
			createNoteMutation.mutate(newFile, {
				onSuccess: () => {
					markFileSaved(newId);
				},
				onError: () => {
					markFileError(newId);
				},
			});
			syncFileSelection(newId);
			markFileSaving(newId);
			if (isMobile) {
				setUIState({ showSidebar: false });
			}
		},
		[
			creationParentFolderId,
			createNoteMutation,
			defaultModeRaw,
			defaultPropertiesTemplateId,
			diaryModeEnabled,
			isMobile,
			queryClient,
			router,
			markFileError,
			markFileSaved,
			markFileSaving,
			setUIState,
			setFolderOpen,
			syncFileSelection,
		],
	);

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
		openSettings();
	}, []);

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

	const {
		showShortcutHelp,
		setShowShortcutHelp,
		handleOpenCommandPalette,
		handleOpenShortcutHelp,
		shortcutGroups,
	} = useNotesLayoutShortcuts({
		handleSwitchToTabIndex,
	});

	useEffect(() => {
		const pendingShortcut = searchParams.get("shortcut");
		if (!pendingShortcut) return;
		const pendingFolderId = searchParams.get("folder");

		switch (pendingShortcut) {
			case "toggleSidebar":
				handleToggleSidebar();
				break;
			case "toggleMetadata":
				handleToggleMetadata();
				break;
			case "focusSidebarSearch":
				setUIState({ showSidebar: true });
				window.setTimeout(() => {
					window.dispatchEvent(new Event("skriuw:focus-sidebar-search"));
				}, 0);
				break;
			case "renameFolder":
				if (pendingFolderId) {
					setUIState({ showSidebar: true });
					window.setTimeout(() => {
						window.dispatchEvent(
							new CustomEvent("skriuw:rename-folder", {
								detail: { id: pendingFolderId },
							}),
						);
					}, 0);
				}
				break;
			case "focusEditor":
				window.setTimeout(() => focusActiveEditor(), 0);
				break;
			case "focusMetadata":
				handleFocusMetadata();
				break;
			case "help":
				if (!isMobile) handleOpenShortcutHelp();
				break;
			default:
				break;
		}

		const params = new URLSearchParams(searchParams.toString());
		params.delete("shortcut");
		params.delete("folder");
		const qs = params.toString();
		router.replace(qs ? `/app?${qs}` : "/app", { scroll: false });
	}, [
		handleFocusMetadata,
		handleOpenShortcutHelp,
		handleToggleMetadata,
		handleToggleSidebar,
		isMobile,
		router,
		searchParams,
		setUIState,
	]);

	useDesktopMenuActions({
		onCreateFile: handleCreateFile,
		onCreateFolder: handleCreateFolder,
		onToggleSidebar: handleToggleSidebar,
		onSave: () => flushAllContent({ createCheckpoint: true }),
	});

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
			const descendantIds = collectFolderSubtreeIds(
				folderId,
				(parentId) => foldersByParentId.get(parentId) ?? [],
			);

			if (newParentId && descendantIds.has(newParentId)) {
				return;
			}

			updateFolderMutation.mutate({
				id: folderId,
				parentId: newParentId,
				...(sortOrder !== undefined && { sortOrder }),
			});
		},
		[foldersByParentId, updateFolderMutation],
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

	const {
		query: commandQuery,
		isOpen: showCommandPalette,
		setIsOpen: setShowCommandPalette,
	} = useCommandRegistry();
	const parsedCommand = parseCommandQuery(commandQuery);
	const trimmedCommandQuery = parsedCommand.query;
	// A bang scoping to actions/settings hides notes entirely, so skip the note
	// search (and its network hit) unless notes are in scope.
	const notesInScope =
		parsedCommand.allowedGroups === null ||
		parsedCommand.allowedGroups.has("Notes") ||
		parsedCommand.allowedGroups.has("Recent");
	const { supportsContentSearch, hits: commandSearchHits } = useNoteSearch(
		showCommandPalette && notesInScope ? trimmedCommandQuery : "",
	);

	const NOTE_RESULT_LIMIT = 15;
	const RECENT_DEFAULT_LIMIT = 7;

	const noteCommandItems = useMemo<CommandPaletteItem[]>(() => {
		const seen = new Set<string>();
		const results: CommandPaletteItem[] = [];

		if (!notesInScope) {
			return results;
		}

		function pushNote(id: string, name: string, group: string, hint?: string) {
			if (seen.has(id) || results.length >= NOTE_RESULT_LIMIT) {
				return;
			}
			seen.add(id);
			results.push({
				id: `note:${id}`,
				label: name || "Untitled",
				group,
				alwaysShow: true,
				hint,
				keywords: ["note", "open", "go to"],
				action: () => handleFileSelect(id),
			});
		}

		if (!trimmedCommandQuery) {
			const filesById = new Map(metadataFiles.map((file) => [file.id, file]));

			for (const id of recentFileIds) {
				if (id === activeFileId) continue;
				const file = filesById.get(id);
				if (file) pushNote(file.id, file.name, "Recent");
				if (results.length >= RECENT_DEFAULT_LIMIT) break;
			}

			if (results.length < RECENT_DEFAULT_LIMIT) {
				const byModified = metadataFiles.toSorted(
					(a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime(),
				);
				for (const file of byModified) {
					if (file.id === activeFileId) continue;
					pushNote(file.id, file.name, "Recent");
					if (results.length >= RECENT_DEFAULT_LIMIT) break;
				}
			}

			return results;
		}

		const lowerQuery = trimmedCommandQuery.toLowerCase();

		for (const file of metadataFiles) {
			const nameMatch = file.name.toLowerCase().includes(lowerQuery);
			const tagMatch = (file.tags ?? []).some((tag) =>
				tag.toLowerCase().includes(lowerQuery),
			);
			if (nameMatch || tagMatch) {
				pushNote(file.id, file.name, "Notes");
			}
		}

		if (supportsContentSearch) {
			for (const hit of commandSearchHits as NoteSearchHit[]) {
				pushNote(hit.id, hit.name, "Notes", hit.snippet);
			}
		}

		return results;
	}, [
		trimmedCommandQuery,
		notesInScope,
		metadataFiles,
		recentFileIds,
		activeFileId,
		supportsContentSearch,
		commandSearchHits,
		handleFileSelect,
	]);

	const templateCommandItems = useMemo<CommandPaletteItem[]>(
		() =>
			NOTE_TEMPLATES.map((template) => ({
				id: `template:${template.id}`,
				label: `New note: ${template.name}`,
				group: "Templates",
				hint: template.description,
				keywords: ["new", "note", "template", "create", template.name],
				action: () => handleCreateFile({ templateId: template.id }),
			})),
		[handleCreateFile],
	);

	useActiveCommandScope("notes");

	useRegisterCommands({
		"notes.newNote": handleCreateFile,
		"notes.newFolder": handleCreateFolder,
		"notes.toggleSidebar": handleToggleSidebar,
		"notes.toggleMetadata": handleToggleMetadata,
		"notes.toggleEditor": handleToggleEditorMode,
		"notes.focusFileTree": handleFocusFileTree,
		"notes.focusMetadata": handleFocusMetadata,
		"notes.toggleSplit": handleToggleSplit,
		"notes.splitHorizontal": handleSplitHorizontal,
		"notes.closeTab": handleCloseFocusedTab,
		"notes.closeSplit": handleCloseSplitPane,
		"notes.focusNextSplitPane": handleFocusNextSplitPane,
		"notes.focusPreviousSplitPane": handleFocusPreviousSplitPane,
		"notes.focusEditor": () => focusActiveEditor(),
		"notes.help": handleOpenShortcutHelp,
		"notes.closeOtherTabs": handleCloseFocusedOtherTabs,
		"notes.closeAllTabs": handleCloseAllTabs,
	});

	useRegisterCommandItemsProvider(
		useCallback(() => {
			return [...templateCommandItems, ...noteCommandItems];
		}, [noteCommandItems, templateCommandItems]),
	);

	// The main layout only needs the notes metadata, not folders (those only
	// feed the sidebar tree, which has its own independent loading state).
	// This MUST NOT depend on the active note query — otherwise clicking
	// another note flips this to `false` while the new note is fetched,
	// replacing the whole UI with skeletons. It also MUST NOT depend on
	// foldersQuery — folders lack the notes query's warm local-first cache,
	// so waiting on them stalls the editor/metadata skeleton behind the
	// already-populated file list, producing two visibly staggered loaders.
	const isEditorReady = notesQuery.data !== undefined || !notesQuery.isPending;
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
			onOpenInSplit: !isMobile ? handleOpenInSplit : undefined,
			onOpenInNewTab: !isMobile ? handleOpenInNewTab : undefined,
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
			handleOpenInSplit,
			handleOpenInNewTab,
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
		// Tree consumes metadata only; passing the stable metadataFiles (not the
		// content-merged `files`) keeps the memoized FileList from re-rendering on
		// every keystroke in the active note.
		files: metadataFiles,
		folders,
		filesById,
		foldersById,
		activeFileId,
		isFilesLoading: notesQuery.isFetching && metadataFiles.length === 0,
		actions: treeActions,
		queries: treeQueries,
		onCollapseAllFolders: () => collapseAllFolders(folders.map((folder) => folder.id)),
		onExpandAllFolders: () => expandAllFolders(folders.map((folder) => folder.id)),
		onCreateFile: handleCreateFile,
		onCreateFolder: handleCreateFolder,
		onCreationParentChange: setCreationParentFolderId,
		onOpenCommandPalette: handleOpenCommandPalette,
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
		countDescendants,
		createFile: handleCreateFile,
		createFolder: handleCreateFolder,
		editorMode,
		expandAllFolders: () => expandAllFolders(folders.map((folder) => folder.id)),
		files,
		getFilesInFolder,
		getFoldersInFolder,
		handleDesktopMetadataResizeStart,
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
		isMetadataResizing,
		isMobile,
		isSidebarResizing,
		metadataDragControls,
		metadataRef,
		metadataTransition,
		metadataWidth,
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
		shortcutGroups,
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
		handleOpenInSplit,
		handleToggleSplit,
		handleToggleSplitOrientation: toggleSplitOrientation,
		handleSwapSplitPaneOrder: swapSplitPaneOrder,
		canToggleSplit: files.length > 1 && Boolean(activeFileId) && !isMobile,
		tabBar: {
			openInTabs,
			primaryTabItems,
			secondaryTabItems,
			onSelectTab: activateTab,
			onCloseTab: handleCloseTab,
			onReorderTabs: handleReorderTabs,
			onTogglePinTab: handleTogglePinTab,
			onCloseOtherTabs: handleCloseOtherTabs,
			onCloseTabsToSide: handleCloseTabsToSide,
			onDropNoteOnTab: handleDropNoteOnTab,
		},
	};
}
