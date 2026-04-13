"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { EditorContainer } from "@/features/editor/components/editor-container";
import { SidebarPanel } from "./sidebar-panel";
import { MetadataPanel } from "./metadata-panel";
import { SaveStatusBadge } from "@/shared/components/save-status-badge";
import { CommandPalette } from "@/shared/ui/command-palette";
import { ShortcutHelpDialog } from "@/shared/ui/shortcut-help-dialog";
import { useNotesLayout } from "../hooks/use-notes-layout";

const SettingsModal = dynamic(
  () => import("@/features/settings/components/settings-modal").then((mod) => mod.SettingsModal),
  { ssr: false },
);

function NotesSidebarSkeleton() {
  return null;
}

function NotesEditorSkeleton() {
  return null;
}

export function NotesLayoutShell() {
  const layout = useNotesLayout();
  const {
    activeFile,
    activeFileSaveState,
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
    setShowSettings,
    setShowShortcutHelp,
    sidebarPanelProps,
    sidebarRef,
    sidebarTransition,
    sidebarWidth,
    showCommandPalette,
    showMetadata,
    showSettings,
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
                className="absolute inset-y-0 right-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize md:flex md:items-center md:justify-center"
              >
                <div className="h-16 w-px rounded-full bg-white/10 transition-colors hover:bg-white/20" />
              </div>
            </div>
          )
        ) : (
          <NotesSidebarSkeleton />
        )}

        {isEditorReady ? (
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="relative flex min-w-0 flex-1 overflow-hidden">
              <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="pointer-events-none absolute right-[5.25rem] top-3 z-20 md:right-[6rem]">
                  <SaveStatusBadge status={activeFileSaveState} />
                </div>
                <EditorContainer
                  file={activeFile}
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
                />
              </div>

              {!isMobile && showMetadata && (
                <MetadataPanel file={activeFile} className="w-56 shrink-0 xl:w-64" />
              )}
            </div>
          </div>
        ) : (
          <NotesEditorSkeleton />
        )}
      </div>

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
                className="native-panel pointer-events-auto h-full w-[min(92vw,24rem)] max-w-full overflow-hidden rounded-r-[2rem] border border-l-0 border-border shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
              >
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
                className="native-panel pointer-events-auto mx-auto h-[min(74dvh,38rem)] w-full max-w-[36rem] overflow-hidden rounded-[2rem] border border-border shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
              >
                <MetadataPanel
                  file={activeFile}
                  isMobile
                  onDragHandlePointerDown={handleMetadataDragStart}
                  onRequestClose={closeMetadata}
                  className="h-full w-full rounded-[2rem] border-l-0"
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </LayoutContainer>
  );
}
