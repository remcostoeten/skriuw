"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { format, isValid, parseISO } from "date-fns";
import { Code, Type, ChevronLeft } from "lucide-react";
import { useShortcut } from "@remcostoeten/use-shortcut";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { useJournalStore } from "@/features/journal/store";
import { useDocumentStore } from "@/store/document-store";
import { JournalSidebar } from "./journal-sidebar";
import { JournalEditor } from "./journal-editor";
import { RichJournalEditor } from "./rich-journal-editor";
import { JournalDatabaseView } from "./journal-database-view";
import { CommandPalette, type CommandPaletteItem } from "@/shared/ui/command-palette";
import { ShortcutHelpDialog, type ShortcutHelpGroup } from "@/shared/ui/shortcut-help-dialog";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { SaveStatusBadge } from "@/shared/components/save-status-badge";

type JournalView = "list" | "editor";

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
      <div className="native-panel flex items-center gap-2 border-b border-border/40 px-4 py-2">
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const $ = useShortcut({ ignoreInputs: true });
  const isHydrated = useJournalStore((state) => state.isHydrated);
  const getEntryByDate = useJournalStore((state) => state.getEntryByDate);
  const getEntrySaveState = useJournalStore((state) => state.getEntrySaveState);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [editorMode, setEditorMode] = useState<"plain" | "rich">("plain");
  const [view, setView] = useState<JournalView>("list");
  const ui = useDocumentStore((s) => s.ui);
  const setUIState = useDocumentStore((s) => s.setUIState);
  const { isMobile } = ui;
  const selectedEntryId = getEntryByDate(selectedDate)?.id;
  const selectedEntrySaveState = getEntrySaveState(selectedEntryId);

  useEffect(() => {
    const requestedDate = searchParams.get("date");
    if (!requestedDate) return;

    const parsedDate = parseISO(requestedDate);
    if (!isValid(parsedDate)) return;

    setSelectedDate(parsedDate);
    setView("editor");
  }, [searchParams]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = (event?: MediaQueryListEvent) => {
      const mobile = event?.matches ?? mediaQuery.matches;
      setUIState({ isMobile: mobile });
      if (mobile) setShowSidebar(false);
      else setShowSidebar(true);
    };
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, [setUIState]);

  const handleSelectEntry = useCallback((dateKey: string) => {
    triggerNativeFeedback("selection");
    const [y, m, d] = dateKey.split("-").map(Number);
    setSelectedDate(new Date(y, m - 1, d));
    setView("editor");
  }, []);

  const handleSelectDate = useCallback(
    (date: Date) => {
      triggerNativeFeedback("selection");
      setSelectedDate(date);
      setView("editor");
      if (isMobile) setShowSidebar(false);
    },
    [isMobile],
  );

  const handleToggleSidebar = useCallback(() => {
    triggerNativeFeedback(showSidebar ? "dismiss" : "selection");
    setShowSidebar((c) => !c);
  }, [showSidebar]);

  const handleNewEntry = useCallback(() => {
    triggerNativeFeedback("success");
    setSelectedDate(new Date());
    setView("editor");
  }, []);

  const handleBackToList = useCallback(() => {
    triggerNativeFeedback("dismiss");
    setView("list");
  }, []);

  const handleOpenSettings = useCallback(() => {
    triggerNativeFeedback("selection");
    setShowSettings(true);
  }, []);

  const handleToggleEditorMode = useCallback(() => {
    triggerNativeFeedback("impact");
    setEditorMode((current) => (current === "plain" ? "rich" : "plain"));
  }, []);

  const handleGoToToday = useCallback(() => {
    triggerNativeFeedback("selection");
    setSelectedDate(new Date());
    setView("editor");
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    triggerNativeFeedback("selection");
    setShowCommandPalette(true);
  }, []);

  const handleOpenShortcutHelp = useCallback(() => {
    triggerNativeFeedback("selection");
    setShowShortcutHelp(true);
  }, []);

  useEffect(() => {
    $.setScopes(["journal"]);

    const bindings = [
      $.in("journal").mod.key("k").except("typing").on(handleOpenCommandPalette, {
        preventDefault: true,
        description: "Open the journal command palette",
      }),
      $.in("journal").mod.shift.key("p").except("typing").on(handleOpenCommandPalette, {
        preventDefault: true,
        description: "Open the journal command palette",
      }),
      $.in("journal").mod.key("slash").except("typing").on(handleToggleSidebar, {
        description: "Toggle sidebar",
      }),
      $.in("journal").mod.key("comma").except("typing").on(handleOpenSettings, {
        preventDefault: true,
        description: "Open settings",
      }),
      $.in("journal").mod.key("e").except("typing").on(handleToggleEditorMode, {
        description: "Switch journal editor mode",
      }),
      $.in("journal").shift.key("slash").except("typing").on(handleOpenShortcutHelp, {
        description: "Open shortcut help",
      }),
    ];

    return () => {
      bindings.forEach((binding) => binding.unbind());
    };
  }, [
    $,
    handleOpenCommandPalette,
    handleOpenSettings,
    handleOpenShortcutHelp,
    handleToggleEditorMode,
    handleBackToList,
    handleToggleSidebar,
  ]);

  const commandItems: CommandPaletteItem[] = [
    {
      id: "today",
      label: "Jump to today",
      keywords: ["journal", "today", "date"],
      description: "Return to today’s journal entry.",
      action: handleGoToToday,
    },
    {
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      shortcut: "mod+slash",
      keywords: ["sidebar", "calendar", "toggle"],
      description: "Show or hide the journal sidebar.",
      action: handleToggleSidebar,
    },
    {
      id: "back-to-list",
      label: "Back to journal list",
      keywords: ["journal", "list", "back", "entries"],
      description: "Return to the journal entries list.",
      action: handleBackToList,
    },
    {
      id: "toggle-editor",
      label: "Switch editor mode",
      shortcut: "mod+e",
      keywords: ["plain", "rich", "editor"],
      description: "Swap between plain text and rich text editing.",
      action: handleToggleEditorMode,
    },
    {
      id: "settings",
      label: "Open settings",
      shortcut: "mod+comma",
      keywords: ["settings", "preferences"],
      description: "Open the settings modal.",
      action: handleOpenSettings,
    },
    {
      id: "notes",
      label: "Go to notes",
      keywords: ["notes", "route", "navigate"],
      description: "Jump back to the notes workspace.",
      action: () => router.push("/"),
    },
  ];

  const shortcutGroups: ShortcutHelpGroup[] = [
    {
      id: "journal-global",
      title: "Journal",
      shortcuts: [
        {
          id: "palette",
          label: "Open command palette",
          combo: "mod+k / mod+shift+p",
        },
        {
          id: "toggle-sidebar",
          label: "Toggle sidebar",
          combo: "mod+slash",
        },
        {
          id: "toggle-editor",
          label: "Switch editor mode",
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
                <div className="native-panel flex items-center gap-2 border-b border-border/40 px-4 py-2">
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
      {isHydrated && isMobile && showSidebar && (
        <>
          <button
            type="button"
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setShowSidebar(false)}
            aria-label="Close sidebar"
          />
          <div className="absolute inset-y-0 left-0 z-50 w-[min(85vw,320px)]">
            <JournalSidebar
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              className="h-full w-full bg-card shadow-2xl"
            />
          </div>
        </>
      )}

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
