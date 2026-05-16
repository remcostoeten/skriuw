"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import {
  WorkspaceContentSkeleton,
  WorkspaceSidebarSkeleton,
} from "@/features/layout/components/app-loading-shell";
import { EditorContainer } from "@/features/editor/components/editor-container";
import { SidebarPanel } from "./sidebar-panel";
import { MetadataPanel } from "./metadata-panel";
import { CommandPalette } from "@/shared/ui/command-palette";
import { ShortcutHelpDialog } from "@/shared/ui/shortcut-help-dialog";
import { useNotesLayout } from "../hooks/use-notes-layout";

function NotesSidebarPlaceholder() {
  return <WorkspaceSidebarSkeleton variant="notes" />;
}

function NotesEditorPlaceholder() {
  return <WorkspaceContentSkeleton variant="notes" />;
}

export function NotesLayoutShell() {
  const layout = useNotesLayout();
  const {
    activeFile,
    files,
    canNavigateNext,
    canNavigatePrev,
    closeMetadata,
    closeSidebar,
    commandItems,
    editorMode,
    handleDesktopSidebarResizeStart,
    handleMetadataDragEnd,
    handleMetadataDragStart,
    handleNavigateNext,
    handleNavigatePrev,
    handleOpenSettings,
    handleSidebarDragEnd,
    handleToggleEditorMode,
    handleToggleMetadata,
    handleToggleSidebar,
    isEditorReady,
    isMobile,
    metadataDragControls,
    metadataTransition,
    overlayTransition,
    prefersReducedMotion,
    setShowCommandPalette,
    setShowShortcutHelp,
    sidebarPanelProps,
    sidebarRef,
    sidebarTransition,
    sidebarWidth,
    showCommandPalette,
    showMetadata,
    showSidebar,
    showShortcutHelp,
    shortcutGroups,
    updateFileContent,
  } = layout;

  return (
    <LayoutContainer className="bg-background">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {!isMobile && <IconRail onOpenSettings={handleOpenSettings} />}

        {isEditorReady ? (
          !isMobile &&
          showSidebar && (
            <div
              ref={sidebarRef}
              className="relative shrink-0 bg-sidebar"
              style={{ width: sidebarWidth }}
            >
              <SidebarPanel {...sidebarPanelProps} />
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                onPointerDown={handleDesktopSidebarResizeStart}
                className="absolute inset-y-0 -right-1 z-20 hidden w-3 cursor-col-resize items-center justify-center md:flex"
              >
                <div className="flex h-12 w-0.5 items-center justify-center rounded-full bg-white/8 transition-colors hover:bg-white/20" />
              </div>
            </div>
          )
        ) : (
          <NotesSidebarPlaceholder />
        )}

        {isEditorReady ? (
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="relative flex min-w-0 flex-1 overflow-hidden">
              <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                <EditorContainer
                  file={activeFile}
                  files={files}
                  editorMode={editorMode ?? "raw"}
                  isMobile={isMobile}
                  onContentChange={updateFileContent}
                  onToggleSidebar={handleToggleSidebar}
                  onToggleMetadata={handleToggleMetadata}
                  onToggleEditorMode={handleToggleEditorMode}
                  onOpenSettings={handleOpenSettings}
                  onNavigatePrev={handleNavigatePrev}
                  onNavigateNext={handleNavigateNext}
                  canNavigatePrev={canNavigatePrev}
                  canNavigateNext={canNavigateNext}
                  fileName={activeFile?.name || "No file selected"}
                  onRenameFile={layout.renameFile}
                />
              </div>

              {!isMobile && showMetadata && (
                <MetadataPanel
                  file={activeFile}
                  files={files}
                  onFileSelect={sidebarPanelProps.onFileSelect}
                  className="shrink-0"
                />
              )}
            </div>
          </div>
        ) : (
          <NotesEditorPlaceholder />
        )}
      </div>

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
              className="absolute inset-0 z-40 bg-black/58"
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
                className="native-panel pointer-events-auto relative h-full w-[min(92vw,24rem)] max-w-full overflow-hidden border border-l-0 border-border touch-pan-y"
              >
<div className="pointer-events-none absolute inset-y-0 right-1 z-10 flex items-center">
                  <div className="flex h-16 w-1 flex-col items-center justify-center gap-2 rounded-sm bg-white/20">
                    <div className="h-5 w-1 rounded-full bg-white/50" />
                  </div>
                </div>
                <SidebarPanel
                  {...sidebarPanelProps}
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
              className="absolute inset-0 z-40 bg-black/52"
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
                onPointerDownCapture={handleMetadataDragStart}
                onDragEnd={handleMetadataDragEnd}
                style={{ willChange: "transform, opacity" }}
                className="native-panel pointer-events-auto mx-auto h-[min(74dvh,38rem)] w-full max-w-[36rem] overflow-hidden border border-border touch-pan-x"
              >
                <MetadataPanel
                  file={activeFile}
                  files={files}
                  isMobile
                  onFileSelect={sidebarPanelProps.onFileSelect}
                  onRequestClose={closeMetadata}
                  className="h-full w-full border-l-0"
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </LayoutContainer>
  );
}
