"use client";

import { useState, useEffect, useCallback } from "react";
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

  return (
    <LayoutContainer className="bg-background">
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

      {isMobile && showSidebar && (
        <>
          <button
            className="absolute inset-0 z-40 bg-black/55 backdrop-blur-[1px]"
            onClick={() => setShowSidebar(false)}
            aria-label="Close sidebar"
          />
          <div className="absolute inset-y-0 left-0 z-50 w-[min(88vw,24rem)] max-w-full shadow-2xl">
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
              className="w-full border-r-0 bg-card/95 backdrop-blur-xl"
              onRequestClose={() => setShowSidebar(false)}
              showCloseButton
            />
          </div>
        </>
      )}

      {isMobile && showMetadata && (
        <>
          <button
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setShowMetadata(false)}
            aria-label="Close metadata panel"
          />
          <div className="absolute inset-x-0 bottom-0 z-50 rounded-t-[1.75rem] border border-b-0 border-border bg-card/95 shadow-2xl backdrop-blur-xl">
            <MetadataPanel
              file={activeFile}
              className="h-[min(68dvh,34rem)] w-full rounded-t-[1.75rem] border-l-0"
            />
          </div>
        </>
      )}
    </LayoutContainer>
  );
}
