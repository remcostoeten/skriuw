import { shortcutDefinition } from "@/commands/bindings";
import { onRoute, type AppCommand } from "@/commands/registry";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "@/shared/icons/static";
import {
  openJournalDayOffset,
  openJournalMonthOffset,
  openJournalToday,
  openJournalYearOffset,
  requestJournalGoToDate,
  requestJournalSearchFocus,
} from "./navigation";

const onJournalRoute = onRoute("journal");

export function journalCommands(openSidebar: () => void): AppCommand[] {
  return [
    {
      id: "journal-focus-search",
      label: "Search journal entries",
      group: "Journal",
      keywords: ["journal", "search", "find", "entry"],
      icon: <SearchIcon size={15} />,
      shortcut: "journalFocusSearch",
      hint: shortcutDefinition("journalFocusSearch").description,
      enabled: onJournalRoute,
      run: () => {
        openSidebar();
        requestJournalSearchFocus();
      },
    },
    {
      id: "journal-today",
      label: "Go to today's entry",
      group: "Journal",
      keywords: ["journal", "today", "now"],
      icon: <CalendarDaysIcon size={15} />,
      shortcut: "journalToday",
      enabled: onJournalRoute,
      run: openJournalToday,
    },
    {
      id: "journal-previous-day",
      label: "Previous day",
      group: "Journal",
      keywords: ["journal", "yesterday", "back", "day"],
      icon: <ChevronLeftIcon size={15} />,
      shortcut: "journalPreviousDay",
      enabled: onJournalRoute,
      run: () => openJournalDayOffset(-1),
    },
    {
      id: "journal-next-day",
      label: "Next day",
      group: "Journal",
      keywords: ["journal", "tomorrow", "forward", "day"],
      icon: <ChevronRightIcon size={15} />,
      shortcut: "journalNextDay",
      enabled: onJournalRoute,
      run: () => openJournalDayOffset(1),
    },
    {
      id: "journal-previous-week",
      label: "Previous week",
      group: "Journal",
      keywords: ["journal", "week", "back"],
      icon: <ChevronLeftIcon size={15} />,
      shortcut: "journalPreviousWeek",
      enabled: onJournalRoute,
      run: () => openJournalDayOffset(-7),
    },
    {
      id: "journal-next-week",
      label: "Next week",
      group: "Journal",
      keywords: ["journal", "week", "forward"],
      icon: <ChevronRightIcon size={15} />,
      shortcut: "journalNextWeek",
      enabled: onJournalRoute,
      run: () => openJournalDayOffset(7),
    },
    {
      id: "journal-previous-month",
      label: "Previous month",
      group: "Journal",
      keywords: ["journal", "month", "back"],
      icon: <ChevronLeftIcon size={15} />,
      shortcut: "journalPreviousMonth",
      enabled: onJournalRoute,
      run: () => openJournalMonthOffset(-1),
    },
    {
      id: "journal-next-month",
      label: "Next month",
      group: "Journal",
      keywords: ["journal", "month", "forward"],
      icon: <ChevronRightIcon size={15} />,
      shortcut: "journalNextMonth",
      enabled: onJournalRoute,
      run: () => openJournalMonthOffset(1),
    },
    {
      id: "journal-previous-year",
      label: "Previous year",
      group: "Journal",
      keywords: ["journal", "year", "back"],
      icon: <ChevronLeftIcon size={15} />,
      shortcut: "journalPreviousYear",
      enabled: onJournalRoute,
      run: () => openJournalYearOffset(-1),
    },
    {
      id: "journal-next-year",
      label: "Next year",
      group: "Journal",
      keywords: ["journal", "year", "forward"],
      icon: <ChevronRightIcon size={15} />,
      shortcut: "journalNextYear",
      enabled: onJournalRoute,
      run: () => openJournalYearOffset(1),
    },
    {
      id: "journal-go-to-date",
      label: "Go to date…",
      group: "Journal",
      keywords: ["journal", "date", "jump", "calendar", "day", "month", "year"],
      icon: <CalendarDaysIcon size={15} />,
      shortcut: "journalGoToDate",
      enabled: onJournalRoute,
      run: requestJournalGoToDate,
    },
  ];
}
