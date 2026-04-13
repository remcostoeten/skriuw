"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useDragControls,
  useReducedMotion,
  type PanInfo,
  type Transition,
} from "framer-motion";
import { useShortcut } from "@remcostoeten/use-shortcut";
import { useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { useDocumentStore } from "@/features/layout/store";
import { buildNoteIndexes } from "@/features/notes/lib/note-indexes";
import { useFileNavigation, useUrlSync } from "./use-notes-navigation";
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
  const files = useNotesStore((state) => state.files);
  const folders = useNotesStore((state) => state.folders);
  const activeFileId = useNotesStore((state) => state.activeFileId);
  const isNotesHydrated = useNotesStore((state) => state.isHydrated);
  const hydratedForActorId = useNotesStore((state) => state.hydratedForActorId);
  const activeFileSaveState = useNotesStore((state) =>
    state.getFileSaveState(state.activeFileId),
  );
  const setActiveFileId = useNotesStore((state) => state.setActiveFileId);
  const createFile = useNotesStore((state) => state.createFile);
  const createFolder = useNotesStore((state) => state.createFolder);
  const updateFileContent = useNotesStore((state) => state.updateFileContent);
  const renameFile = useNotesStore((state) => state.renameFile);
  const renameFolder = useNotesStore((state) => state.renameFolder);
  const deleteFile = useNotesStore((state) => state.deleteFile);
  const deleteFolder = useNotesStore((state) => state.deleteFolder);
  const moveFile = useNotesStore((state) => state.moveFile);
  const moveFolder = useNotesStore((state) => state.moveFolder);
  const toggleFolder = useNotesStore((state) => state.toggleFolder);

  const ui = useDocumentStore((state) => state.ui);
  const setUIState = useDocumentStore((state) => state.setUIState);
  const setSidebarWidth = useDocumentStore((state) => state.setSidebarWidth);
  const syncLayoutActor = useDocumentStore((state) => state.syncActor);
  const { showSidebar, showMetadata, sidebarWidth, isMobile } = ui;

  const initializePreferences = usePreferencesStore((state) => state.initialize);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [editorMode, setEditorMode] = useState<"raw" | "block" | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const metadataDragControls = useDragControls();
  const sidebarResizeActiveRef = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { activeFile, filesById, foldersById, filesByParentId, foldersByParentId, descendantCountByFolderId } =
    useMemo(() => buildNoteIndexes(files, folders, activeFileId), [files, folders, activeFileId]);

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

  useEffect(() => {
    void syncLayoutActor(auth.actorId);
  }, [auth.actorId, syncLayoutActor]);

  useEffect(() => {
    if (!activeFile) {
      setEditorMode("block");
      return;
    }

    setEditorMode(activeFile.preferredEditorMode ?? "block");
  }, [activeFile]);

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
    triggerNativeFeedback("success");
    createFile("Untitled");
    if (isMobile) {
      setUIState({ showSidebar: false });
    }
  }, [createFile, isMobile, setUIState]);

  const handleCreateFolder = useCallback(() => {
    triggerNativeFeedback("impact");
    createFolder("Untitled");
  }, [createFolder]);

  const handleOpenSettings = useCallback(() => {
    triggerNativeFeedback("selection");
    setShowSettings(true);
  }, []);

  const handleToggleEditorMode = useCallback(() => {
    if (!activeFile || !editorMode) return;

    triggerNativeFeedback("impact");
    const nextMode = editorMode === "raw" ? "block" : "raw";

    if (nextMode === "block") {
      updateFileContent(activeFile.id, activeFile.content, {
        richContent: markdownToRichDocument(activeFile.content),
        preferredEditorMode: nextMode,
      });
    } else {
      updateFileContent(activeFile.id, activeFile.content, {
        preferredEditorMode: nextMode,
      });
    }

    setEditorMode(nextMode);
  }, [activeFile, editorMode, updateFileContent]);

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
        label: "Create note",
        shortcut: "mod+n",
        keywords: ["new", "file", "note", "create"],
        description: "Create a fresh note and focus it immediately.",
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
      handleOpenSettings,
      handleToggleEditorMode,
      handleToggleMetadata,
      handleToggleSidebar,
      router,
    ],
  );

  const isEditorReady = isNotesHydrated && hydratedForActorId === auth.actorId;
  const sidebarPanelProps = {
    files,
    folders,
    filesById,
    foldersById,
    activeFileId,
    onFileSelect: handleFileSelect,
    onToggleFolder: toggleFolder,
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
    commandItems,
    countDescendants,
    createFile: handleCreateFile,
    createFolder: handleCreateFolder,
    editorMode,
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
    updateFileContent,
  };
}
