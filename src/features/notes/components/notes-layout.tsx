"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
  type Transition,
} from "framer-motion";
import { useShortcut } from "@remcostoeten/use-shortcut";
import { useNotesStore } from "@/store/notes-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { useDocumentStore } from "@/store/document-store";
import { SidebarPanel } from "./sidebar-panel";
import { MetadataPanel } from "./metadata-panel";
import { EditorContainer } from "@/features/editor/components/editor-container";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { BottomBar } from "@/features/layout/components/bottom-bar";
import { IconRail } from "@/features/layout/components/icon-rail";
import { useFileNavigation, useUrlSync } from "../hooks/use-notes-navigation";
import { CommandPalette, type CommandPaletteItem } from "@/shared/ui/command-palette";
import { ShortcutHelpDialog, type ShortcutHelpGroup } from "@/shared/ui/shortcut-help-dialog";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { buildNoteIndexes } from "@/features/notes/lib/note-indexes";
import { SaveStatusBadge } from "@/shared/components/save-status-badge";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { AuthEntryPoint } from "@/features/auth/components/auth-entry-point";

const SHEET_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
const SHEET_DISMISS_VELOCITY = 0.11;
const DESKTOP_SIDEBAR_MIN_WIDTH = 248;
const DESKTOP_SIDEBAR_MAX_WIDTH = 420;
const DESKTOP_SIDEBAR_WIDTH_STORAGE_KEY = "notes-sidebar-width";

const SettingsModal = dynamic(
  () => import("@/features/settings/components/settings-modal").then((mod) => mod.SettingsModal),
  { ssr: false },
);

function NotesSidebarSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div
      className={`relative shrink-0 border-r border-border/60 bg-sidebar/70 ${
        isMobile ? "hidden" : "w-[min(22rem,28vw)]"
      }`}
    >
      <div className="space-y-3 p-4">
        <div className="h-8 w-full animate-pulse rounded-xl bg-white/6" />
        <div className="h-7 w-24 animate-pulse rounded-lg bg-white/6" />
        <div className="space-y-2 pt-2">
          <div className="h-9 w-full animate-pulse rounded-xl bg-white/6" />
          <div className="h-9 w-[88%] animate-pulse rounded-xl bg-white/6" />
          <div className="h-9 w-[82%] animate-pulse rounded-xl bg-white/6" />
          <div className="h-9 w-[74%] animate-pulse rounded-xl bg-white/6" />
        </div>
      </div>
    </div>
  );
}

function NotesEditorSkeleton() {
  return (
    <div className="relative flex min-w-0 flex-1 overflow-hidden">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-20 bg-gradient-to-b from-white/[0.04] to-transparent" />
        <div className="flex flex-1 flex-col gap-4 px-5 py-6 md:px-8">
          <div className="h-5 w-32 animate-pulse rounded-full bg-white/8" />
          <div className="h-10 w-[min(24rem,70%)] animate-pulse rounded-2xl bg-white/7" />
          <div className="space-y-3 pt-2">
            <div className="h-4 w-full animate-pulse rounded-full bg-white/6" />
            <div className="h-4 w-[96%] animate-pulse rounded-full bg-white/6" />
            <div className="h-4 w-[90%] animate-pulse rounded-full bg-white/6" />
            <div className="h-4 w-[78%] animate-pulse rounded-full bg-white/6" />
          </div>
        </div>
      </div>
      <div className="hidden w-56 shrink-0 border-l border-border/50 bg-card/30 xl:block" />
    </div>
  );
}

export function NotesLayout() {
  const router = useRouter();
  const $ = useShortcut({ ignoreInputs: true });
  const files = useNotesStore((state) => state.files);
  const folders = useNotesStore((state) => state.folders);
  const activeFileId = useNotesStore((state) => state.activeFileId);
  const isNotesHydrated = useNotesStore((state) => state.isHydrated);
  const activeFileSaveState = useNotesStore((state) => state.getFileSaveState(state.activeFileId));
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
  // UI state from unified store
  const ui = useDocumentStore((s) => s.ui);
  const setUIState = useDocumentStore((s) => s.setUIState);
  const { showSidebar, showMetadata, sidebarWidth, isMobile } = ui;
  const setSidebarWidth = useDocumentStore((s) => s.setSidebarWidth);

  const { initialize: initializePreferences } = usePreferencesStore();
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
    const savedSidebarWidth = window.localStorage.getItem(DESKTOP_SIDEBAR_WIDTH_STORAGE_KEY);
    if (!savedSidebarWidth) return;

    const parsedWidth = Number(savedSidebarWidth);
    if (!Number.isNaN(parsedWidth)) {
      setSidebarWidth(
        Math.min(DESKTOP_SIDEBAR_MAX_WIDTH, Math.max(DESKTOP_SIDEBAR_MIN_WIDTH, parsedWidth)),
      );
    }
  }, [setSidebarWidth]);

  useEffect(() => {
    initializePreferences();
  }, [initializePreferences]);

  useEffect(() => {
    if (!activeFile) {
      setEditorMode(null);
      return;
    }
    setEditorMode(activeFile.preferredEditorMode ?? "block");
  }, [activeFile]);

  useEffect(() => {
    window.localStorage.setItem(DESKTOP_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    const hasOverlayOpen = showSidebar || showSettings || showMetadata;
    document.body.style.overflow = hasOverlayOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, showSidebar, showSettings, showMetadata]);

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
  }, []);

  const { canNavigatePrev, canNavigateNext, navigatePrev, navigateNext } = useFileNavigation(
    files,
    activeFileId,
  );

  const { handleFileSelect: syncFileSelection } = useUrlSync(setActiveFileId);
  const isEditorReady = isNotesHydrated && editorMode !== null;

  const handleFileSelect = useCallback(
    (id: string) => {
      triggerNativeFeedback("selection");
      syncFileSelection(id);
      if (isMobile) {
        setUIState({ showSidebar: false });
      }
    },
    [isMobile, syncFileSelection, setUIState],
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
    (event: React.PointerEvent<HTMLDivElement>) => {
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
      if (info.offset.x < -72 || info.velocity.x < -SHEET_DISMISS_VELOCITY) {
        closeSidebar();
      }
    },
    [closeSidebar],
  );

  const handleMetadataDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y > 96 || info.velocity.y > SHEET_DISMISS_VELOCITY) {
        closeMetadata();
      }
    },
    [closeMetadata],
  );

  const handleMetadataDragStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
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

  const commandItems: CommandPaletteItem[] = [
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
  ];

  const shortcutGroups: ShortcutHelpGroup[] = [
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
          id: "toggle-editor",
          label: "Toggle editor surface",
          combo: "mod+e",
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

  return (
    <LayoutContainer className="bg-background">
      <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 md:right-4">
        <AuthEntryPoint />
      </div>

      {isMobile && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_62%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-48 bg-[radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_68%)]" />
        </>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {!isMobile && (
          <IconRail onOpenSettings={handleOpenSettings} />
        )}

        {isEditorReady ? (
          !isMobile &&
          showSidebar && (
            <div
              ref={sidebarRef}
              className="relative shrink-0 bg-sidebar"
              style={{ width: sidebarWidth }}
            >
              <SidebarPanel
                files={files}
                folders={folders}
                filesById={filesById}
                foldersById={foldersById}
                activeFileId={activeFileId}
                onFileSelect={handleFileSelect}
                onToggleFolder={toggleFolder}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                onRenameFile={renameFile}
                onRenameFolder={renameFolder}
                onDeleteFile={deleteFile}
                onDeleteFolder={deleteFolder}
                onMoveFile={moveFile}
                onMoveFolder={moveFolder}
                getFilesInFolder={getFilesInFolder}
                getFoldersInFolder={getFoldersInFolder}
                countDescendants={countDescendants}
              />
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                onPointerDown={handleDesktopSidebarResizeStart}
                className="absolute inset-y-0 right-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize md:flex md:items-center md:justify-center"
              >
                <div className="h-16 w-px rounded-full bg-white/10 transition-colors hover:bg-white/20" />
              </div>
            </div>
          )
        ) : (
          <NotesSidebarSkeleton isMobile={isMobile} />
        )}

        {isEditorReady ? (
          <div className="relative flex min-w-0 flex-1 overflow-hidden">
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-20 bg-gradient-to-b from-white/[0.04] to-transparent" />
              <div className="pointer-events-none absolute right-[5.25rem] top-3 z-20 md:right-[6rem]">
                <SaveStatusBadge status={activeFileSaveState} />
              </div>
              <EditorContainer
                file={activeFile}
                editorMode={editorMode}
                isMobile={isMobile}
                onContentChange={updateFileContent}
                onToggleSidebar={handleToggleSidebar}
                onToggleMetadata={handleToggleMetadata}
                onNavigatePrev={() => navigatePrev(handleFileSelect)}
                onNavigateNext={() => navigateNext(handleFileSelect)}
                canNavigatePrev={canNavigatePrev}
                canNavigateNext={canNavigateNext}
                fileName={activeFile?.name || "No file selected"}
              />
            </div>

            {!isMobile && showMetadata && (
              <MetadataPanel file={activeFile} className="w-56 xl:w-64 shrink-0" />
            )}
          </div>
        ) : (
          <NotesEditorSkeleton />
        )}
      </div>

      <BottomBar
        editorMode={editorMode ?? "raw"}
        isMobile={isMobile}
        onOpenSettings={handleOpenSettings}
        onToggleEditorMode={handleToggleEditorMode}
      />
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
      <CommandPalette
        open={showCommandPalette}
        onOpenChange={setShowCommandPalette}
        items={commandItems}
        description="Notes actions and route navigation."
      />
      <ShortcutHelpDialog
        open={showShortcutHelp}
        onOpenChange={setShowShortcutHelp}
        groups={shortcutGroups}
        description="Global shortcuts for the notes workspace."
      />

      <AnimatePresence>
        {isEditorReady && isMobile && showSidebar && (
          <>
            <motion.button
              key="sidebar-backdrop"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={overlayTransition}
              className="absolute inset-0 z-40 bg-black/58 backdrop-blur-[2px]"
              onClick={closeSidebar}
              aria-label="Close sidebar"
            />
            <div className="pointer-events-none absolute inset-y-0 left-0 z-50 flex w-full max-w-full items-stretch pr-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
              <motion.div
                key="sidebar-panel"
                initial={prefersReducedMotion ? { x: -12, opacity: 0 } : { x: -24, opacity: 0.96 }}
                animate={{ x: 0, opacity: 1 }}
                exit={prefersReducedMotion ? { x: -8, opacity: 0 } : { x: -32, opacity: 0.94 }}
                transition={sidebarTransition}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragDirectionLock
                dragElastic={{ left: 0.14, right: 0.05 }}
                onDragEnd={handleSidebarDragEnd}
                style={{ willChange: "transform, opacity" }}
                className="native-panel pointer-events-auto h-full w-[min(92vw,24rem)] max-w-full overflow-hidden rounded-r-[2rem] border border-l-0 border-border/70 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
              >
                <SidebarPanel
                  files={files}
                  folders={folders}
                  filesById={filesById}
                  foldersById={foldersById}
                  activeFileId={activeFileId}
                  onFileSelect={handleFileSelect}
                  onToggleFolder={toggleFolder}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onRenameFile={renameFile}
                  onRenameFolder={renameFolder}
                  onDeleteFile={deleteFile}
                  onDeleteFolder={deleteFolder}
                  onMoveFile={moveFile}
                  onMoveFolder={moveFolder}
                  getFilesInFolder={getFilesInFolder}
                  getFoldersInFolder={getFoldersInFolder}
                  countDescendants={countDescendants}
                  className="w-full border-r-0 bg-transparent"
                  onRequestClose={closeSidebar}
                  showCloseButton
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditorReady && isMobile && showMetadata && (
          <>
            <motion.button
              key="metadata-backdrop"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={overlayTransition}
              className="absolute inset-0 z-40 bg-black/52 backdrop-blur-[2px]"
              onClick={closeMetadata}
              aria-label="Close metadata panel"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)]">
              <motion.div
                key="metadata-panel"
                initial={prefersReducedMotion ? { y: 16, opacity: 0 } : { y: 56, opacity: 0.98 }}
                animate={{ y: 0, opacity: 1 }}
                exit={prefersReducedMotion ? { y: 12, opacity: 0 } : { y: 88, opacity: 0.94 }}
                transition={metadataTransition}
                drag="y"
                dragControls={metadataDragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragDirectionLock
                dragElastic={{ top: 0.05, bottom: 0.16 }}
                onDragEnd={handleMetadataDragEnd}
                style={{ willChange: "transform, opacity" }}
                className="native-panel pointer-events-auto mx-auto h-[min(74dvh,38rem)] w-full max-w-[36rem] overflow-hidden rounded-[2rem] border border-border/70 shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
              >
                <MetadataPanel
                  file={activeFile}
                  isMobile
                  onDragHandlePointerDown={handleMetadataDragStart}
                  onRequestClose={closeMetadata}
                  className="h-full w-full border-l-0 rounded-[2rem]"
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </LayoutContainer>
  );
}
