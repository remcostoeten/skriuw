import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
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
import { useToday } from "@/shared/format/use-today";
import { cn } from "@/shared/styling/class-names";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import {
  WEEKDAY_LABELS,
  formatListDate,
  formatLongDate,
  formatMonthTitle,
  isDateKey,
  monthOfKey,
  sameMonth,
  shiftDay,
  weekStart,
  type DateKey,
  type MonthKey,
} from "@skriuw/renderer-core/journal/dates";
import { JournalCalendar } from "./month-calendar";
import { sameDateKeySet, selectEntryDateKeys } from "../model";
import { openJournalToday } from "../navigation";

type Props = {
  store: RendererStore;
};

const VIEW_STORAGE_KEY = "skriuw.sidebar-calendar-view";

type CalendarView = "week" | "month";

function readView(): CalendarView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "month" ? "month" : "week";
  } catch {
    return "week";
  }
}

function writeView(view: CalendarView): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    return;
  }
}

const headerButtonClass =
  "inline-flex h-6 items-center justify-center rounded-[5px] px-1.5 text-[11px] text-theme-dim transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:bg-sidebar-accent/60 focus-visible:text-foreground focus-visible:shadow-none focus-visible:outline-none pointer-coarse:h-9 pointer-coarse:min-w-9";

type WeekStripProps = {
  today: DateKey;
  entryDates: ReadonlySet<DateKey>;
  onSelectDay: (key: DateKey) => void;
};

function WeekStrip({ today, entryDates, onSelectDay }: WeekStripProps) {
  const start = weekStart(today);
  const days = WEEKDAY_LABELS.map((_, index) => shiftDay(start, index));
  const [focused, setFocused] = useState<DateKey>(today);
  const tabStop = days.includes(focused) ? focused : today;
  const gridRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const index = Math.min(6, Math.max(0, days.indexOf(tabStop) + step));
    const next = days[index] ?? tabStop;
    setFocused(next);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date-key="${next}"]`)?.focus();
  }

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-7 gap-0.5 text-center"
      role="group"
      aria-label="This week"
      onKeyDown={onKeyDown}
    >
      {WEEKDAY_LABELS.map((label) => (
        <span key={label} className="pb-1 text-[10px] text-theme-dim" aria-hidden="true">
          {label}
        </span>
      ))}
      {days.map((key) => {
        const isToday = key === today;
        const hasEntry = entryDates.has(key);
        return (
          <button
            key={key}
            type="button"
            data-date-key={key}
            tabIndex={key === tabStop ? 0 : -1}
            aria-label={`${formatLongDate(key)}${isToday ? ", today" : ""}${hasEntry ? ", has an entry" : ""}`}
            aria-current={isToday ? "date" : undefined}
            onFocus={() => setFocused(key)}
            onClick={() => onSelectDay(key)}
            className={cn(
              "relative h-[30px] rounded-[7px] text-xs tabular-nums transition-colors duration-100 focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.4)] focus-visible:outline-none pointer-coarse:h-11",
              isToday
                ? "bg-accent-ink font-semibold text-accent-ink-foreground"
                : "text-foreground/72 hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            {Number(key.slice(8))}
            {hasEntry && (
              <span
                className={cn(
                  "absolute bottom-1 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full",
                  isToday ? "bg-accent-ink-foreground" : "bg-theme-dim",
                )}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The calendar at the bottom of the workspace sidebar: this week by default,
 * the full month on request. Days with a journal entry carry a dot; picking a
 * day jumps to that entry in the journal route.
 */
export function SidebarCalendar({ store }: Props) {
  const today = useToday();
  const [view, setView] = useState<CalendarView>(readView);
  const [month, setMonth] = useState<MonthKey>(() => monthOfKey(today));
  const [menuDay, setMenuDay] = useState<DateKey | null>(null);
  const entryDates = useRendererSelector(store, selectEntryDateKeys, sameDateKeySet);
  const open = view === "month";

  function toggleOpen(): void {
    setView((current) => {
      const next = current === "month" ? "week" : "month";
      writeView(next);
      return next;
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

  const currentMonth = monthOfKey(today);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <section
          className="group relative shrink-0 border-t border-sidebar-border"
          aria-label="Journal calendar"
          onContextMenu={onContextMenu}
          onPointerDown={onPointerDown}
        >
          <div className="flex h-9 items-center gap-0.5 pr-2 pl-3.5">
            <span className="mr-auto text-[11.5px] font-medium text-sidebar-foreground">
              {open ? "Calendar" : formatMonthTitle(currentMonth)}
            </span>
            <button type="button" className={headerButtonClass} onClick={openJournalToday}>
              Today
            </button>
            <button
              type="button"
              className={cn(headerButtonClass, "w-6 px-0")}
              aria-label={open ? "Show this week" : "Show the whole month"}
              aria-expanded={open}
              onClick={toggleOpen}
            >
              {open ? <FoldVerticalIcon size={13} /> : <UnfoldVerticalIcon size={13} />}
            </button>
          </div>
          <div className="max-h-[35dvh] overflow-y-auto overscroll-contain px-2.5 pb-3">
            {open ? (
              <JournalCalendar
                month={month}
                selected={null}
                entryDates={entryDates}
                onSelectDay={openDay}
                onMonthChange={setMonth}
              />
            ) : (
              <WeekStrip today={today} entryDates={entryDates} onSelectDay={openDay} />
            )}
          </div>
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
          {open ? "Show this week" : "Show the whole month"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
