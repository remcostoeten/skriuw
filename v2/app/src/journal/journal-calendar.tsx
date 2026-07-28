import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "../shared/icons";
import {
  WEEKDAY_LABELS,
  calendarKeyMove,
  formatLongDate,
  formatMonthTitle,
  monthGrid,
  monthOfKey,
  sameMonth,
  shiftMonth,
  todayKey,
  type CalendarDay,
  type DateKey,
  type MonthKey,
} from "./dates";

type Props = {
  month: MonthKey;
  selected: DateKey | null;
  entryDates: ReadonlySet<DateKey>;
  onSelectDay: (key: DateKey) => void;
  onMonthChange: (month: MonthKey) => void;
};

const navButtonClass =
  "flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The day that owns the grid's single tab stop. Prefers the day the user last
 * moved to, then the selected day, then today, so tabbing into the calendar
 * always lands somewhere meaningful — and never on all 42 days in turn.
 */
function tabStopDay(
  days: readonly CalendarDay[],
  candidates: readonly (DateKey | null)[],
): DateKey | null {
  for (const candidate of candidates) {
    if (candidate !== null && days.some((day) => day.key === candidate)) {
      return candidate;
    }
  }
  return days.find((day) => day.inMonth)?.key ?? null;
}

function dayLabel(key: DateKey, hasEntry: boolean): string {
  return hasEntry ? `${formatLongDate(key)}, has an entry` : formatLongDate(key);
}

/**
 * The Monday-first month grid shared by the journal sidebar and the notes
 * sidebar, with a dot under every day that has an entry. The month keeps a
 * single tab stop; arrows move the focused day, Home/End span the week,
 * PageUp/PageDown step a month, and Enter opens the focused day.
 */
export function JournalCalendar({
  month,
  selected,
  entryDates,
  onSelectDay,
  onMonthChange,
}: Props) {
  const days = useMemo(() => monthGrid(month), [month]);
  const today = todayKey();
  const [roving, setRoving] = useState<DateKey | null>(selected);
  const dayRefs = useRef(new Map<DateKey, HTMLButtonElement>());
  const pendingFocus = useRef(false);

  useEffect(() => {
    setRoving(selected);
  }, [selected]);

  useEffect(() => {
    if (!pendingFocus.current) {
      return;
    }
    pendingFocus.current = false;
    if (roving !== null) {
      dayRefs.current.get(roving)?.focus();
    }
  }, [roving, month]);

  const registerDay = useCallback((key: DateKey, node: HTMLButtonElement | null) => {
    if (node === null) {
      dayRefs.current.delete(key);
      return;
    }
    dayRefs.current.set(key, node);
  }, []);

  const tabStop = tabStopDay(days, [roving, selected, today]);

  function moveTo(key: DateKey): void {
    pendingFocus.current = true;
    setRoving(key);
    const target = monthOfKey(key);
    if (!sameMonth(target, month)) {
      onMonthChange(target);
    }
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.altKey || event.ctrlKey || event.metaKey || tabStop === null) {
      return;
    }
    const next = calendarKeyMove(tabStop, event.key);
    if (next === null) {
      return;
    }
    event.preventDefault();
    moveTo(next);
  }

  function changeMonth(offset: number): void {
    onMonthChange(shiftMonth(month, offset));
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className={navButtonClass}
          aria-label="Previous month"
        >
          <ChevronLeftIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          className={navButtonClass}
          aria-label="Next month"
        >
          <ChevronRightIcon size={14} />
        </button>
        <span aria-live="polite" className="ml-1 text-[11px] font-semibold text-foreground/90">
          {formatMonthTitle(month)}
        </span>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-6 items-center justify-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50"
          >
            {label}
          </div>
        ))}
      </div>
      <div
        role="group"
        aria-label={`${formatMonthTitle(month)}. Use the arrow keys to move by day, Enter to open one.`}
        onKeyDown={handleGridKeyDown}
        className="grid grid-cols-7 gap-0.5"
      >
        {days.map((day) => {
          const isSelected = day.key === selected;
          const isToday = day.key === today;
          const hasEntry = entryDates.has(day.key);
          let dayClass = "text-foreground/70 hover:border-border hover:bg-muted";
          if (!day.inMonth) {
            dayClass = "text-muted-foreground/25 hover:border-border hover:bg-muted";
          }
          if (isToday && !isSelected) {
            dayClass = "border-border font-bold text-foreground";
          }
          if (isSelected) {
            dayClass = "border-border bg-muted font-semibold text-foreground";
          }
          return (
            <button
              type="button"
              key={day.key}
              ref={(node) => registerDay(day.key, node)}
              onClick={() => {
                setRoving(day.key);
                onSelectDay(day.key);
              }}
              tabIndex={day.key === tabStop ? 0 : -1}
              aria-label={dayLabel(day.key, hasEntry)}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              className={`relative flex h-7 w-full items-center justify-center rounded-sm border border-transparent text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dayClass}`}
            >
              {day.dayOfMonth}
              {hasEntry && (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isSelected ? "bg-foreground/60" : "bg-primary"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
