"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseISO, isValid } from "date-fns";
import { useReducedMotion, type Transition } from "framer-motion";
import { useShortcut } from "@remcostoeten/use-shortcut";
import { useNotesStore } from "@/features/notes/store";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import type { CommandPaletteItem } from "@/shared/ui/command-palette";
import type { ShortcutHelpGroup } from "@/shared/ui/shortcut-help-dialog";
import { useJournalEntries, useJournalTags } from "./use-journal-hooks";

export type JournalView = "list" | "editor";
export type JournalEditorMode = "plain" | "rich";

type UseJournalLayoutResult = {
  selectedDate: Date;
  sidebarWidth: number;
  showSettings: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  showSidebar: boolean;
  setShowSidebar: Dispatch<SetStateAction<boolean>>;
  showCommandPalette: boolean;
  setShowCommandPalette: Dispatch<SetStateAction<boolean>>;
  showShortcutHelp: boolean;
  setShowShortcutHelp: Dispatch<SetStateAction<boolean>>;
  editorMode: JournalEditorMode;
  view: JournalView;
  isHydrated: boolean;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  overlayTransition: Transition;
  sidebarTransition: Transition;
  commandItems: CommandPaletteItem[];
  shortcutGroups: ShortcutHelpGroup[];
  handleSelectEntry: (dateKey: string) => void;
  handleSelectDate: (date: Date) => void;
  handleToggleSidebar: () => void;
  handleNewEntry: () => void;
  handleBackToList: () => void;
  handleOpenSettings: () => void;
  handleToggleEditorMode: () => void;
  handleGoToToday: () => void;
  handleOpenCommandPalette: () => void;
  handleOpenShortcutHelp: () => void;
  handleGoToNotes: () => void;
  closeSidebar: () => void;
};

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;

  const parsedDate = parseISO(value);
  return isValid(parsedDate) ? parsedDate : null;
}

export function useJournalLayout(): UseJournalLayoutResult {
  const router = useRouter();
  const searchParams = useSearchParams();
  const $ = useShortcut({ ignoreInputs: true });
  const entriesQuery = useJournalEntries();
  const tagsQuery = useJournalTags();
  const ui = useNotesStore((state) => state.ui);
  const setUIState = useNotesStore((state) => state.setUIState);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [editorMode, setEditorMode] = useState<JournalEditorMode>("plain");
  const [view, setView] = useState<JournalView>("list");
  const prefersReducedMotion = Boolean(useReducedMotion());
  const { isMobile, sidebarWidth } = ui;
  const isHydrated = entriesQuery.isSuccess && tagsQuery.isSuccess;

  useEffect(() => {
    const requestedDate = parseDateParam(searchParams.get("date"));
    if (!requestedDate) return;

    setSelectedDate(requestedDate);
    setView("editor");
  }, [searchParams]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = (event?: MediaQueryListEvent) => {
      const mobile = event?.matches ?? mediaQuery.matches;
      setUIState({ isMobile: mobile });
      setShowSidebar(!mobile);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, [setUIState]);

  const selectDate = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      setView("editor");
      if (isMobile) setShowSidebar(false);
    },
    [isMobile],
  );

  const handleSelectEntry = useCallback(
    (dateKey: string) => {
      triggerNativeFeedback("selection");
      const [year, month, day] = dateKey.split("-").map(Number);
      selectDate(new Date(year, month - 1, day));
    },
    [selectDate],
  );

  const handleSelectDate = useCallback(
    (date: Date) => {
      triggerNativeFeedback("selection");
      selectDate(date);
    },
    [selectDate],
  );

  const handleToggleSidebar = useCallback(() => {
    setShowSidebar((current) => {
      triggerNativeFeedback(current ? "dismiss" : "selection");
      return !current;
    });
  }, []);

  const handleNewEntry = useCallback(() => {
    triggerNativeFeedback("success");
    selectDate(new Date());
  }, [selectDate]);

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
    selectDate(new Date());
  }, [selectDate]);

  const handleOpenCommandPalette = useCallback(() => {
    triggerNativeFeedback("selection");
    setShowCommandPalette(true);
  }, []);

  const handleOpenShortcutHelp = useCallback(() => {
    triggerNativeFeedback("selection");
    setShowShortcutHelp(true);
  }, []);

  const handleGoToNotes = useCallback(() => {
    triggerNativeFeedback("selection");
    router.push("/");
  }, [router]);

  const closeSidebar = useCallback(() => {
    triggerNativeFeedback("dismiss");
    setShowSidebar(false);
  }, []);

  const overlayTransition = useMemo<Transition>(
    () =>
      prefersReducedMotion
        ? { duration: 0.12, ease: "linear" }
        : { duration: 0.2, ease: "easeOut" },
    [prefersReducedMotion],
  );

  const sidebarTransition = useMemo<Transition>(
    () =>
      prefersReducedMotion
        ? { duration: 0.16, ease: "easeOut" }
        : { duration: 0.46, ease: [0.32, 0.72, 0, 1] },
    [prefersReducedMotion],
  );

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
    handleToggleSidebar,
  ]);

  const commandItems = useMemo<CommandPaletteItem[]>(
    () => [
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
        action: handleGoToNotes,
      },
    ],
    [
      handleBackToList,
      handleGoToNotes,
      handleGoToToday,
      handleOpenSettings,
      handleToggleEditorMode,
      handleToggleSidebar,
    ],
  );

  const shortcutGroups = useMemo<ShortcutHelpGroup[]>(
    () => [
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
    ],
    [],
  );

  return {
    selectedDate,
    sidebarWidth,
    showSettings,
    setShowSettings,
    showSidebar,
    setShowSidebar,
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
    handleOpenSettings,
    handleToggleEditorMode,
    handleGoToToday,
    handleOpenCommandPalette,
    handleOpenShortcutHelp,
    handleGoToNotes,
    closeSidebar,
  };
}
