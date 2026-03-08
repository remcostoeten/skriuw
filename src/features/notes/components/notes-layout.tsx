"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
  type Transition,
} from "framer-motion";
import { useNotesStore } from "@/store/notes-store";
import { useSettingsStore } from "@/modules/settings";
import { SidebarPanel } from "./sidebar-panel";
import { MetadataPanel } from "./metadata-panel";
import { EditorContainer } from "@/features/editor/components/editor-container";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { BottomBar } from "@/features/layout/components/bottom-bar";
import { IconRail } from "@/features/layout/components/icon-rail";
import { SettingsModal } from "@/features/settings/components/settings-modal";
import { useFileNavigation, useUrlSync } from "../hooks/use-notes-navigation";

const SHEET_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
const SHEET_DISMISS_VELOCITY = 0.11;

export function NotesLayout() {
  const {
    files,
    folders,
    activeFile,
    activeFileId,
    showMetadata,
    setActiveFileId,
    setShowMetadata,
    createFile,
    createFolder,
    updateFileContent,
    renameFile,
    renameFolder,
    deleteFile,
    deleteFolder,
    moveFile,
    moveFolder,
    toggleFolder,
    getFilesInFolder,
    getFoldersInFolder,
    countDescendants,
  } = useNotesStore();
  const { settings, initializeSettings } = useSettingsStore();
  const [isMobile, setIsMobile] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [editorMode, setEditorMode] = useState<"markdown" | "richtext">("markdown");
  const prefersReducedMotion = useReducedMotion();
  const metadataDragControls = useDragControls();

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = (event?: MediaQueryListEvent) => {
      setIsMobile(event?.matches ?? mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  // Initialize settings on mount
  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  // Sync editor mode with settings default
  useEffect(() => {
    if (settings) {
      setEditorMode(settings.defaultModeMarkdown ? "markdown" : "richtext");
    }
  }, [settings?.defaultModeMarkdown]);

  useEffect(() => {
    setShowSidebar(!isMobile);
    setShowMetadata(false);
  }, [isMobile, setShowMetadata]);

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

  const { canNavigatePrev, canNavigateNext, navigatePrev, navigateNext } = useFileNavigation(
    files,
    activeFileId,
  );

  const { handleFileSelect: syncFileSelection } = useUrlSync(setActiveFileId);

  const handleFileSelect = useCallback(
    (id: string) => {
      syncFileSelection(id);
      if (isMobile) {
        setShowSidebar(false);
      }
    },
    [isMobile, syncFileSelection],
  );

  const handleToggleSidebar = useCallback(() => {
    setShowSidebar((current) => !current);
    if (isMobile) {
      setShowMetadata(false);
    }
  }, [isMobile, setShowMetadata]);

  const handleToggleMetadata = useCallback(() => {
    setShowMetadata(!showMetadata);
    if (isMobile) {
      setShowSidebar(false);
    }
  }, [isMobile, setShowMetadata, showMetadata]);

  const handleCreateFile = useCallback(() => {
    createFile("Untitled");
    if (isMobile) {
      setShowSidebar(false);
    }
  }, [createFile, isMobile]);

  const handleCreateFolder = useCallback(() => {
    createFolder("Untitled");
  }, [createFolder]);

  const closeSidebar = useCallback(() => {
    setShowSidebar(false);
  }, []);

  const closeMetadata = useCallback(() => {
    setShowMetadata(false);
  }, [setShowMetadata]);

  const handleSidebarDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -72 || info.velocity.x < -SHEET_DISMISS_VELOCITY) {
      closeSidebar();
    }
  }, [closeSidebar]);

  const handleMetadataDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 96 || info.velocity.y > SHEET_DISMISS_VELOCITY) {
      closeMetadata();
    }
  }, [closeMetadata]);

  const handleMetadataDragStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      metadataDragControls.start(event);
    },
    [metadataDragControls],
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

  return (
    <LayoutContainer className="bg-background">
      {isMobile && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_62%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-48 bg-[radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_68%)]" />
        </>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {!isMobile && (
          <IconRail
            activeTab="notes"
            onTabChange={() => {}}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        {!isMobile && showSidebar && (
          <SidebarPanel
            files={files}
            folders={folders}
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
        )}

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-20 bg-gradient-to-b from-white/[0.04] to-transparent" />
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

          {!isMobile && showMetadata && (
            <MetadataPanel file={activeFile} className="w-56 xl:w-64" />
          )}
        </div>
      </div>

      <BottomBar
        editorMode={editorMode}
        isMobile={isMobile}
        onOpenSettings={() => setShowSettings(true)}
        onToggleEditorMode={() =>
          setEditorMode((current) => (current === "markdown" ? "richtext" : "markdown"))
        }
      />
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />

      <AnimatePresence>
        {isMobile && showSidebar && (
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
                className="pointer-events-auto h-full w-[min(92vw,24rem)] max-w-full overflow-hidden rounded-r-[2rem] border border-l-0 border-border/70 bg-card/92 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
              >
                <SidebarPanel
                  files={files}
                  folders={folders}
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
        {isMobile && showMetadata && (
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
                className="pointer-events-auto mx-auto h-[min(74dvh,38rem)] w-full max-w-[36rem] overflow-hidden rounded-[2rem] border border-border/70 bg-card/92 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
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
