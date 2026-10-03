import { useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { appRouteHash, journalDayHash } from "@skriuw/renderer-core/route/app-route";
import {
  CalendarDaysIcon,
  CalendarIcon,
  FoldVerticalIcon,
  UnfoldVerticalIcon,
} from "@/shared/icons/static";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { SectionToggle } from "@/shared/ui/section-header";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import {
  formatListDate,
  isDateKey,
  monthOfKey,
  sameMonth,
  todayKey,
  type DateKey,
  type MonthKey,
} from "@skriuw/renderer-core/journal/dates";
import { JournalCalendar } from "./month-calendar";
import { sameDateKeySet, selectEntryDateKeys } from "../model";
import { openJournalToday } from "../navigation";

type Props = {
  store: RendererStore;
};

const OPEN_STORAGE_KEY = "skriuw.sidebar-calendar-open";

function readOpen(): boolean {
  try {
    const stored = window.localStorage.getItem(OPEN_STORAGE_KEY);
    if (stored !== null) return stored === "open";
  } catch {
    return !isTouchViewport();
  }
  return !isTouchViewport();
}

function isTouchViewport(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
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
  const [menuDay, setMenuDay] = useState<DateKey | null>(null);
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

  function onContextMenu(event: MouseEvent<HTMLElement>): void {
    event.stopPropagation();
    const key =
      (event.target as HTMLElement).closest<HTMLElement>("[data-date-key]")?.dataset.dateKey ??
      null;
    setMenuDay(key !== null && isDateKey(key) ? key : null);
  }

  function onPointerDown(event: PointerEvent<HTMLElement>): void {
    if (event.pointerType === "touch") {
      event.stopPropagation();
    }
  }

  const currentMonth = monthOfKey(todayKey());

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <section
          className="group relative shrink-0 border-t border-sidebar-border"
          aria-label="Journal calendar"
          onContextMenu={onContextMenu}
          onPointerDown={onPointerDown}
        >
          <SectionToggle
            title="Calendar"
            open={open}
            onToggle={toggleOpen}
            className="bg-sidebar/90"
          />
          {open && (
            <div className="max-h-[35dvh] overflow-y-auto overscroll-contain px-2.5 pb-2 pt-2">
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
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        {menuDay !== null && (
          <>
            <ContextMenuItem onClick={() => openDay(menuDay)} className="gap-2">
              <CalendarDaysIcon className="h-4 w-4" />
              Open {formatListDate(menuDay)}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={openJournalToday} className="gap-2">
          <CalendarDaysIcon className="h-4 w-4" />
          Open today's entry
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!open || sameMonth(month, currentMonth)}
          onClick={() => setMonth(currentMonth)}
          className="gap-2"
        >
          <CalendarIcon className="h-4 w-4" />
          Show this month
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            window.location.hash = appRouteHash("journal");
          }}
          className="gap-2"
        >
          <CalendarIcon className="h-4 w-4" />
          Open journal
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={toggleOpen} className="gap-2">
          {open ? (
            <FoldVerticalIcon size={14} className="h-3.5 w-3.5" />
          ) : (
            <UnfoldVerticalIcon size={14} className="h-3.5 w-3.5" />
          )}
          {open ? "Collapse calendar" : "Expand calendar"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
