import { useMemo } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "../shared/icons";
import {
  WEEKDAY_LABELS,
  formatMonthTitle,
  monthGrid,
  shiftMonth,
  todayKey,
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
 * The Monday-first month grid shared by the journal sidebar and the notes
 * sidebar, with a dot under every day that has an entry.
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
  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          className={navButtonClass}
          aria-label="Previous month"
        >
          <ChevronLeftIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          className={navButtonClass}
          aria-label="Next month"
        >
          <ChevronRightIcon size={14} />
        </button>
        <span className="ml-1 text-[11px] font-semibold text-foreground/90">
          {formatMonthTitle(month)}
        </span>
      </div>
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-6 items-center justify-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
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
              onClick={() => onSelectDay(day.key)}
              aria-label={day.key}
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
