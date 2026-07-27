import { useState } from "react";
import { journalDayHash } from "../app-route";
import { CalendarDaysIcon, ChevronDownIcon, ChevronRightIcon } from "../shared/icons";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererStore } from "../store/types";
import { monthOfKey, todayKey, type DateKey, type MonthKey } from "./dates";
import { JournalCalendar } from "./journal-calendar";
import { sameDateKeySet, selectEntryDateKeys } from "./model";

type Props = {
  store: RendererStore;
};

const OPEN_STORAGE_KEY = "skriuw.sidebar-calendar-open";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_STORAGE_KEY) !== "closed";
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, open ? "open" : "closed");
  } catch {
    return;
  }
}

/**
 * Collapsible month calendar at the bottom of the workspace sidebar. Days
 * with a journal entry carry a dot; picking a day jumps to that entry in the
 * journal route.
 */
export function SidebarCalendar({ store }: Props) {
  const [open, setOpen] = useState(readOpen);
  const [month, setMonth] = useState<MonthKey>(() => monthOfKey(todayKey()));
  const entryDates = useRendererSelector(store, selectEntryDateKeys, sameDateKeySet);

  function toggleOpen(): void {
    setOpen((current) => {
      writeOpen(!current);
      return !current;
    });
  }

  function openDay(key: DateKey): void {
    window.location.hash = journalDayHash(key);
  }

  return (
    <section
      className="shrink-0 border-t border-sidebar-border"
      aria-label="Journal calendar"
    >
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        {open ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
        <CalendarDaysIcon size={11} />
        Calendar
      </button>
      {open && (
        <div className="px-2.5 pb-2">
          <JournalCalendar
            month={month}
            selected={null}
            entryDates={entryDates}
            onSelectDay={openDay}
            onMonthChange={setMonth}
          />
        </div>
      )}
    </section>
  );
}
