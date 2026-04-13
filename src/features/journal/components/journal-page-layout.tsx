"use client";

import dynamic from "next/dynamic";
import { format } from "date-fns";
import { Code, Type, ChevronLeft } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { JournalSidebar } from "./journal-sidebar";
import { JournalEditor } from "./journal-editor";
import { RichJournalEditor } from "./rich-journal-editor";
import { JournalDatabaseView } from "./journal-database-view";
import { CommandPalette } from "@/shared/ui/command-palette";
import { ShortcutHelpDialog } from "@/shared/ui/shortcut-help-dialog";
import { SaveStatusBadge } from "@/shared/components/save-status-badge";
import { useJournalLayout } from "../hooks/use-journal-layout";

const SettingsModal = dynamic(
  () => import("@/features/settings/components/settings-modal").then((mod) => mod.SettingsModal),
  { ssr: false },
);

function JournalSidebarSkeleton({ isMobile }: { isMobile: boolean }) {
  if (isMobile) return null;

  return (
    <div className="w-[260px] shrink-0 border-r border-border bg-card/45 p-3">
      <div className="space-y-3">
        <div className="h-8 w-full animate-pulse rounded-xl bg-white/6" />
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-7 animate-pulse rounded-md bg-white/6" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 pt-2">
          {Array.from({ length: 35 }).map((_, index) => (
            <div key={index} className="h-7 animate-pulse rounded-md bg-white/6" />
          ))}
        </div>
      </div>
    </div>
  );
}

function JournalContentSkeleton() {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
        <div className="h-7 w-24 animate-pulse rounded-xl bg-white/6" />
        <div className="h-4 w-32 animate-pulse rounded-full bg-white/6" />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5 py-6 md:px-8">
        <div className="h-8 w-48 animate-pulse rounded-2xl bg-white/7" />
        <div className="space-y-3">
          <div className="h-4 w-full animate-pulse rounded-full bg-white/6" />
          <div className="h-4 w-[94%] animate-pulse rounded-full bg-white/6" />
          <div className="h-4 w-[88%] animate-pulse rounded-full bg-white/6" />
          <div className="h-4 w-[76%] animate-pulse rounded-full bg-white/6" />
        </div>
      </div>
    </div>
  );
}

export function JournalPageLayout() {
  const {
    selectedDate,
    selectedEntrySaveState,
    showSettings,
    setShowSettings,
    showSidebar,
    showCommandPalette,
    setShowCommandPalette,
    showShortcutHelp,
    setShowShortcutHelp,
    editorMode,
    view,
    isHydrated,
    isMobile,
    prefersReducedMotion,
    overlayTransition,
    sidebarTransition,
    commandItems,
    shortcutGroups,
    handleSelectEntry,
    handleSelectDate,
    handleNewEntry,
    handleBackToList,
    handleOpenSettings,
    handleToggleEditorMode,
    closeSidebar,
  } = useJournalLayout();

  return (
    <LayoutContainer className="bg-background">
      <div className="relative flex min-h-0 flex-1">
        {/* Icon rail (desktop) */}
        {!isMobile && (
          <IconRail onOpenSettings={handleOpenSettings} />
        )}

        {/* Sidebar (desktop) */}
        {isHydrated && !isMobile && showSidebar && (
          <JournalSidebar selectedDate={selectedDate} onSelectDate={handleSelectDate} />
        )}
        {!isHydrated && <JournalSidebarSkeleton isMobile={isMobile} />}

        {/* Main content area */}
        {isHydrated ? (
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
            {view === "list" ? (
              <JournalDatabaseView onSelectEntry={handleSelectEntry} onNewEntry={handleNewEntry} />
            ) : (
              <>
                {/* Editor header with back navigation */}
                <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
                  <button
                    onClick={handleBackToList}
                    className="pressable flex h-7 items-center gap-1 rounded-xl px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Journal
                  </button>

                  <span className="text-[12px] text-muted-foreground/40">
                    {format(selectedDate, "dd MM yyyy")}
                  </span>

                  <div className="ml-auto flex items-center gap-1">
                    <SaveStatusBadge status={selectedEntrySaveState} className="mr-2" />
                    <button
                      onClick={handleToggleEditorMode}
                      className="pressable flex h-7 items-center gap-1.5 rounded-xl px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title={editorMode === "plain" ? "Switch to Rich Text" : "Switch to Plain Text"}
                    >
                      {editorMode === "plain" ? (
                        <>
                          <Type className="h-3 w-3" strokeWidth={1.5} />
                          Rich
                        </>
                      ) : (
                        <>
                          <Code className="h-3 w-3" strokeWidth={1.5} />
                          Plain
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {editorMode === "plain" ? (
                  <JournalEditor selectedDate={selectedDate} />
                ) : (
                  <RichJournalEditor selectedDate={selectedDate} />
                )}
              </>
            )}
          </div>
        ) : (
          <JournalContentSkeleton />
        )}
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {isHydrated && isMobile && showSidebar && (
          <>
            <motion.button
              key="journal-sidebar-backdrop"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={overlayTransition}
              className="absolute inset-0 z-40 bg-black/54"
              onClick={closeSidebar}
              aria-label="Close sidebar"
            />
            <div className="pointer-events-none absolute inset-y-0 left-0 z-50 flex w-full items-stretch pr-5 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
              <motion.div
                key="journal-sidebar-panel"
                initial={prefersReducedMotion ? { x: -12, opacity: 0 } : { x: -28, opacity: 0.96 }}
                animate={{ x: 0, opacity: 1 }}
                exit={prefersReducedMotion ? { x: -8, opacity: 0 } : { x: -34, opacity: 0.94 }}
                transition={sidebarTransition}
                style={{ willChange: "transform, opacity" }}
                className="native-panel pointer-events-auto h-full w-[min(88vw,22rem)] max-w-full overflow-hidden border border-l-0 border-border"
              >
                <JournalSidebar
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                  className="h-full w-full border-r-0 bg-transparent"
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
      <CommandPalette
        open={showCommandPalette}
        onOpenChange={setShowCommandPalette}
        items={commandItems}
        description="Journal actions and route navigation."
      />
      <ShortcutHelpDialog
        open={showShortcutHelp}
        onOpenChange={setShowShortcutHelp}
        groups={shortcutGroups}
        description="Global shortcuts for the journal workspace."
      />
    </LayoutContainer>
  );
}
