"use client";

import dynamic from "next/dynamic";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, Code, Settings2, Sidebar, Type } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import { AuthRequiredState } from "@/features/auth/components/auth-required-state";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { JournalSidebar } from "./journal-sidebar";
import { JournalEditor } from "./journal-editor";
import { JournalDatabaseView } from "./journal-database-view";
import { CommandPalette } from "@/shared/ui/command-palette";
import { ShortcutHelpDialog } from "@/shared/ui/shortcut-help-dialog";
import { SaveStatusBadge } from "@/shared/components/save-status-badge";
import { useJournalLayout } from "../hooks/use-journal-layout";
import { useJournalEntry } from "../hooks/use-journal-entry";

const SettingsModal = dynamic(
  () => import("@/features/settings/components/settings-modal").then((mod) => mod.SettingsModal),
  { ssr: false },
);

function JournalSidebarPlaceholder() {
  return null;
}

function JournalContentPlaceholder() {
  return null;
}

type JournalEditorToolbarProps = {
  selectedDate: Date;
  selectedEntrySaveState: React.ComponentProps<typeof SaveStatusBadge>["status"];
  editorMode: "plain" | "rich";
  isMobile: boolean;
  onToggleSidebar: () => void;
  onBackToList: () => void;
  onToggleEditorMode: () => void;
  onGoToToday: () => void;
  onOpenSettings: () => void;
};

function JournalEditorToolbar({
  selectedDate,
  selectedEntrySaveState,
  editorMode,
  isMobile,
  onToggleSidebar,
  onBackToList,
  onToggleEditorMode,
  onGoToToday,
  onOpenSettings,
}: JournalEditorToolbarProps) {
  const editorModeTitle =
    editorMode === "plain" ? "Switch to Rich Text" : "Switch to Plain Text";

  if (isMobile) {
    const mobileControlClass =
      "flex h-11 w-11 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground active:scale-[0.97]";

    return (
      <div className="border-b border-border bg-card px-3 pb-3 pt-[max(env(safe-area-inset-top),0.85rem)] sm:px-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex h-11 items-center gap-1 border border-border bg-background px-1">
            <button onClick={onToggleSidebar} className={mobileControlClass} title="Open journal">
              <Sidebar className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button onClick={onBackToList} className={mobileControlClass} title="Back to journal">
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button onClick={onGoToToday} className={mobileControlClass} title="Go to today">
              <CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
          </div>

          <div className="flex h-11 min-w-0 flex-1 items-center border border-border bg-background px-4">
            <div className="min-w-0">
              <div className="truncate text-[10px] text-muted-foreground/70">Journal</div>
              <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                {format(selectedDate, "EEEE, dd MMMM yyyy")}
              </div>
            </div>
          </div>

          <div className="flex h-11 items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:flex sm:items-center">
              <SaveStatusBadge status={selectedEntrySaveState} />
            </div>
            <button
              onClick={onToggleEditorMode}
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
              title={editorModeTitle}
            >
              {editorMode === "plain" ? (
                <Type className="h-[18px] w-[18px]" strokeWidth={1.7} />
              ) : (
                <Code className="h-[18px] w-[18px]" strokeWidth={1.7} />
              )}
            </button>
            <button
              onClick={onOpenSettings}
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
              title="Open settings"
            >
              <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
          </div>
        </div>
        <div className="pt-2 sm:hidden">
          <SaveStatusBadge status={selectedEntrySaveState} />
        </div>
      </div>
    );
  }

  const desktopIconButtonClass =
    "pressable flex h-7 w-7 items-center justify-center border border-transparent transition-colors duration-200";

  return (
    <div
      className={cn(
        "border-b border-sidebar-border border-l bg-sidebar text-sidebar-foreground",
        "flex h-11 items-center px-3",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSidebar}
          className={cn(
            desktopIconButtonClass,
            "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
          )}
          title="Toggle sidebar"
        >
          <Sidebar className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={onBackToList}
          className={cn(
            desktopIconButtonClass,
            "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
          )}
          title="Back to journal list"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={onGoToToday}
          className={cn(
            desktopIconButtonClass,
            "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
          )}
          title="Go to today"
        >
          <CalendarDays className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center gap-3 text-sm">
        <span className="text-sidebar-foreground/58">Journal</span>
        <span className="font-medium text-sidebar-foreground/80 max-w-[28rem] truncate">
          {format(selectedDate, "EEEE, dd MMMM yyyy")}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <SaveStatusBadge status={selectedEntrySaveState} />
        <button
          onClick={onToggleEditorMode}
          className={cn(
            desktopIconButtonClass,
            "w-auto gap-1 px-2.5 text-[11px]",
            "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
          )}
          title={editorModeTitle}
        >
          {editorMode === "plain" ? (
            <>
              <Type className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Rich Text</span>
            </>
          ) : (
            <>
              <Code className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Plain Text</span>
            </>
          )}
        </button>
        <button
          onClick={onOpenSettings}
          className={cn(
            desktopIconButtonClass,
            "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
          )}
          title="Open settings"
        >
          <Settings2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export function JournalPageLayout() {
  const auth = useAuthSnapshot();
  const {
    selectedDate,
    sidebarWidth,
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
    handleToggleSidebar,
    handleNewEntry,
    handleBackToList,
    handleGoToNotes,
    handleOpenSettings,
    handleToggleEditorMode,
    handleGoToToday,
    closeSidebar,
  } = useJournalLayout();
  const journalEntry = useJournalEntry(selectedDate);

  if (auth.isReady && auth.phase !== "authenticated") {
    return (
      <AuthRequiredState
        title="Sign in to access your journal"
        description="Journal entries are now tied to your account so the same data is available across devices."
      />
    );
  }

  return (
    <LayoutContainer className="bg-background">
      <div className="relative flex min-h-0 flex-1">
        {/* Icon rail (desktop) */}
        {!isMobile && (
          <IconRail onOpenSettings={handleOpenSettings} />
        )}

        {/* Sidebar (desktop) */}
        {isHydrated && !isMobile && showSidebar && (
          <div className="relative shrink-0" style={{ width: sidebarWidth }}>
            <JournalSidebar selectedDate={selectedDate} onSelectDate={handleSelectDate} />
          </div>
        )}
        {!isHydrated && <JournalSidebarPlaceholder />}

        {/* Main content area */}
        {isHydrated ? (
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
            {view === "list" ? (
              <JournalDatabaseView
                onSelectEntry={handleSelectEntry}
                onNewEntry={handleNewEntry}
                onToggleSidebar={handleToggleSidebar}
                onGoToToday={handleGoToToday}
                onGoToNotes={handleGoToNotes}
                onOpenSettings={handleOpenSettings}
                isMobile={isMobile}
              />
            ) : (
              <>
                <JournalEditorToolbar
                  selectedDate={selectedDate}
                  selectedEntrySaveState={journalEntry.saveState}
                  editorMode={editorMode}
                  isMobile={isMobile}
                  onToggleSidebar={handleToggleSidebar}
                  onBackToList={handleBackToList}
                  onToggleEditorMode={handleToggleEditorMode}
                  onGoToToday={handleGoToToday}
                  onOpenSettings={handleOpenSettings}
                />

                <JournalEditor
                  selectedDate={selectedDate}
                  editorMode={editorMode}
                  entryState={journalEntry}
                />
              </>
            )}
          </div>
        ) : (
          <JournalContentPlaceholder />
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
