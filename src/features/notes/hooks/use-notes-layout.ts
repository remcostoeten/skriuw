"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useDragControls, useReducedMotion, type PanInfo, type Transition } from "framer-motion";
import { useShortcut } from "@remcostoeten/use-shortcut";
import { applyFolderUiState, useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { buildNoteIndexes } from "@/features/notes/lib/note-indexes";
import { useFileNavigation, useUrlSync } from "./use-notes-navigation";
import { useNotes } from "./use-notes";
import { useFolders } from "./use-folders";
import { useCreateNote } from "./use-create-note";
import { useUpdateNote } from "./use-update-note";
import { useDeleteNote } from "./use-delete-note";
import { useCreateFolder } from "./use-create-folder";
import { useUpdateFolder } from "./use-update-folder";
import { useDeleteFolder } from "./use-delete-folder";
import { useDebouncedSave } from "./use-debounced-save";
import type { CreateNoteInput } from "@/domain/notes/api";
import type { CreateFolderInput } from "@/domain/folders/api";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import type { CommandPaletteItem } from "@/shared/ui/command-palette";
import type { ShortcutHelpGroup } from "@/shared/ui/shortcut-help-dialog";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useAuthSnapshot } from "@/platform/auth/use-auth";

const SHEET_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
const SHEET_DISMISS_VELOCITY = 480;
const SHEET_DRAG_BLOCKLIST =
  "button, a, input, textarea, select, option, [role='button'], [role='tab'], [contenteditable='true'], [data-sheet-no-drag]";
const DESKTOP_SIDEBAR_MIN_WIDTH = 248;
const DESKTOP_SIDEBAR_MAX_WIDTH = 420;
const SAVED_BADGE_DURATION_MS = 1800;

function generateNoteContent(name: string): string {
  const title = name.replace(/\.md$/, "");
  return `# ${title}\n\n`;
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

export function useNotesLayout() {
  const router = useRouter();
  const $ = useShortcut({ ignoreInputs: true });
  const auth = useAuthSnapshot();
  const notesQuery = useNotes();
  const foldersQuery = useFolders();
  const activeFileId = useNotesStore((state) => state.activeFileId);
  const ensureActiveFileId = useNotesStore((state) => state.ensureActiveFileId);
  const folderOpenState = useNotesStore((state) => state.folderOpenState);
  const activeFileSaveState = useNotesStore((state) => state.getFileSaveState(state.activeFileId));
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
  const updateFileContent = useDebouncedSave({
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
      updateFileContent({
        id,
        content,
        richContent: options?.richContent,
        preferredEditorMode: options?.preferredEditorMode,
      });
    },
    [updateFileContent],
  );
  const files = notesQuery.data ?? [];
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
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [editorMode, setEditorMode] = useState<"raw" | "block" | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const metadataDragControls = useDragControls();
  const sidebarResizeActiveRef = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const {
    activeFile,
    filesById,
    foldersById,
    filesByParentId,
    foldersByParentId,
    descendantCountByFolderId,
  } = useMemo(() => buildNoteIndexes(files, folders, activeFileId), [files, folders, activeFileId]);

  const { handleFileSelect: syncFileSelection } = useUrlSync(setActiveFileId);
  const { canNavigatePrev, canNavigateNext, navigatePrev, navigateNext } = useFileNavigation(
    files,
    activeFileId,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = (event?: MediaQueryListEvent) => {
      const mobile = event?.matches ?? mediaQuery.matches;
      setUIState({
        isMobile: mobile,
        showSidebar: !mobile,
        showMetadata: false,
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

  useEffect(() => {
    ensureActiveFileId(files);
  }, [ensureActiveFileId, files]);

  useEffect(() => {
    if (!activeFile) {
      setEditorMode("block");
      return;
    }

    setEditorMode(activeFile.preferredEditorMode ?? (defaultModeRaw ? "raw" : "block"));
  }, [activeFile, defaultModeRaw]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    const hasOverlayOpen = showSidebar || showSettings || showMetadata || showShortcutHelp;
    document.body.style.overflow = hasOverlayOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, showSidebar, showSettings, showMetadata, showShortcutHelp]);

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
    (id: string) => {
      triggerNativeFeedback("selection");
      syncFileSelection(id);
      if (isMobile) {
        setUIState({ showSidebar: false });
      }
    },
    [isMobile, setUIState, syncFileSelection],
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

  const handleCreateFile = useCallback(() => {
    if (diaryModeEnabled) {
      triggerNativeFeedback("success");
      const today = format(new Date(), "yyyy-MM-dd");
      router.push(`/journal?date=${today}`);
      if (isMobile) {
        setUIState({ showSidebar: false });
      }
      return;
    }

    triggerNativeFeedback("success");
    const preferredEditorMode = defaultModeRaw ? "raw" : "block";
    const createdAt = new Date();
    const newFile: CreateNoteInput = {
      id: crypto.randomUUID(),
      name: "Untitled.md",
      content: generateNoteContent("Untitled"),
      richContent: markdownToRichDocument(generateNoteContent("Untitled")),
      preferredEditorMode,
      parentId: null,
    };

    createNoteMutation.mutate(newFile, {
      onSuccess: () => {
        markFileSaved(newFile.id as string);
      },
      onError: () => {
        markFileError(newFile.id as string);
      },
    });
    setActiveFileId(newFile.id as string);
    markFileSaving(newFile.id as string);
    setEditorMode(preferredEditorMode);
    if (isMobile) {
      setUIState({ showSidebar: false });
    }
  }, [
    createNoteMutation,
    defaultModeRaw,
    diaryModeEnabled,
    isMobile,
    router,
    markFileError,
    markFileSaved,
    markFileSaving,
    setActiveFileId,
    setUIState,
  ]);

  const handleCreateFolder = useCallback(() => {
    triggerNativeFeedback("impact");
    const newFolder: CreateFolderInput = {
      id: crypto.randomUUID(),
      name: "Untitled",
      parentId: null,
    };

    setFolderOpen(newFolder.id as string, true);
    createFolderMutation.mutate(newFolder);
  }, [createFolderMutation, setFolderOpen]);

  const handleOpenSettings = useCallback(() => {
    triggerNativeFeedback("selection");
    setShowSettings(true);
  }, []);

  const handleToggleEditorMode = useCallback(() => {
    if (!activeFile || !editorMode) return;

    triggerNativeFeedback("impact");
    const nextMode = editorMode === "raw" ? "block" : "raw";
    const updatedAt = new Date();
    updateNoteMutation.mutate(
      {
        id: activeFile.id,
        content: activeFile.content,
        richContent:
          nextMode === "block"
            ? markdownToRichDocument(activeFile.content)
            : activeFile.richContent,
        preferredEditorMode: nextMode,
      },
      {
        onSuccess: () => {
          markFileSaved(activeFile.id);
        },
        onError: () => {
          markFileError(activeFile.id);
        },
      },
    );
    markFileSaving(activeFile.id);

    setEditorMode(nextMode);
  }, [activeFile, editorMode, markFileError, markFileSaved, markFileSaving, updateNoteMutation]);

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
      const updatedAt = new Date();
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
    },
    [markFileError, markFileSaved, markFileSaving, updateNoteMutation],
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
      deleteNoteMutation.mutate(id);
    },
    [clearFileSaveState, deleteNoteMutation],
  );

  const deleteFolder = useCallback(
    (id: string) => {
      deleteFolderMutation.mutate(id);
    },
    [deleteFolderMutation],
  );

  const moveFile = useCallback(
    (fileId: string, newParentId: string | null) => {
      updateNoteMutation.mutate({
        id: fileId,
        parentId: newParentId,
      });
    },
    [updateNoteMutation],
  );

  const moveFolder = useCallback(
    (folderId: string, newParentId: string | null) => {
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
    : { duration: 0.5, ease: SHEET_EASE };

  const metadataTransition: Transition = prefersReducedMotion
    ? { duration: 0.16, ease: "easeOut" }
    : { duration: 0.5, ease: SHEET_EASE };

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
    navigatePrev(handleFileSelect);
  }, [handleFileSelect, navigatePrev]);

  const handleNavigateNext = useCallback(() => {
    navigateNext(handleFileSelect);
  }, [handleFileSelect, navigateNext]);

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
          ? "Open today in the journal workspace."
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
        action: () => router.push("/journal"),
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

  const isEditorReady =
    auth.isReady &&
    auth.phase === "authenticated" &&
    !notesQuery.isPending &&
    !foldersQuery.isPending;
  const sidebarPanelProps = {
    files,
    folders,
    filesById,
    foldersById,
    activeFileId,
    onFileSelect: handleFileSelect,
    onToggleFolder: handleToggleFolder,
    onCollapseAllFolders: () => collapseAllFolders(folders.map((folder) => folder.id)),
    onExpandAllFolders: () => expandAllFolders(folders.map((folder) => folder.id)),
    onCreateFile: handleCreateFile,
    onCreateFolder: handleCreateFolder,
    onRenameFile: renameFile,
    onRenameFolder: renameFolder,
    onDeleteFile: deleteFile,
    onDeleteFolder: deleteFolder,
    onMoveFile: moveFile,
    onMoveFolder: moveFolder,
    getFilesInFolder,
    getFoldersInFolder,
    countDescendants,
  };

  return {
    activeFile,
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
    setShowSettings,
    setShowShortcutHelp,
    sidebarPanelProps,
    sidebarRef,
    sidebarTransition,
    sidebarWidth,
    showCommandPalette,
    showMetadata,
    showSettings,
    showShortcutHelp,
    showSidebar,
    shortcutGroups: NOTES_SHORTCUT_GROUPS,
    updateFileContent: handleUpdateFileContent,
  };
}
