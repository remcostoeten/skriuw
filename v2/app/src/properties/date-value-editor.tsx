import { useState } from "react";
import type { NoteProperty, NotePropertyValue } from "../contracts/workspace";
import { ChevronLeftIcon, ChevronRightIcon } from "../shared/icons";
import { cn } from "../shared/lib/utils";
import { replaceStringValue } from "./property-editor-model";
import { PropertyPopover } from "./property-popover";

type DateValue = Extract<NotePropertyValue, { type: "date" }>;

type Props = {
  property: NoteProperty;
  value: DateValue;
  onUpdate: (property: NoteProperty) => void;
};

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const GRID_CELLS = 42;

const navButtonClass =
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50";
const footerButtonClass =
  "flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50";

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatMonthTitle(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

export function DateValueEditor({ property, value, onUpdate }: Props) {
  const selected = parseIsoDate(value.value);

  function commit(next: string): void {
    if (next !== value.value) {
      onUpdate({ ...property, value: replaceStringValue(value, next) });
    }
  }

  return (
    <PropertyPopover
      className="w-full min-w-0"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`${property.name} value`}
          aria-expanded={open}
          className={cn(
            "flex min-h-7 w-full min-w-0 cursor-pointer items-center rounded-md bg-transparent px-1 py-0.5 text-left text-[13px] outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/70 focus-visible:ring-1 focus-visible:ring-ring/45",
            selected ? "text-foreground" : "text-muted-foreground/55",
          )}
        >
          <span className="truncate">{selected ? formatDisplayDate(selected) : "Empty"}</span>
        </button>
      )}
    >
      {({ close }) => (
        <CalendarPanel
          selected={selected}
          onPick={(date) => {
            commit(toIsoDate(date));
            close();
          }}
          onClear={() => {
            commit("");
            close();
          }}
        />
      )}
    </PropertyPopover>
  );
}

function CalendarPanel({
  selected,
  onPick,
  onClear,
}: {
  selected: Date | null;
  onPick: (date: Date) => void;
  onClear: () => void;
}) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(() => {
    const anchor = selected ?? today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  const mondayOffset = (viewMonth.getDay() + 6) % 7;
  const days = Array.from({ length: GRID_CELLS }, (_, index) => {
    return new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth(),
      1 - mondayOffset + index,
    );
  });

  function shiftMonth(offset: number): void {
    setViewMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }

  return (
    <div className="w-60 p-2">
      <div className="mb-1 flex items-center justify-between gap-1 px-0.5">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className={navButtonClass}
        >
          <ChevronLeftIcon size={13} />
        </button>
        <span className="min-w-0 truncate text-xs font-medium text-foreground">
          {formatMonthTitle(viewMonth)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className={navButtonClass}
        >
          <ChevronRightIcon size={13} />
        </button>
      </div>
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            aria-hidden="true"
            className="flex size-8 items-center justify-center text-[10px] font-medium uppercase text-muted-foreground/55"
          >
            {label}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = day.getMonth() === viewMonth.getMonth();
          const isSelected = selected !== null && sameDay(day, selected);
          const isToday = sameDay(day, today);
          return (
            <button
              key={toIsoDate(day)}
              type="button"
              aria-label={formatDisplayDate(day)}
              aria-pressed={isSelected}
              onClick={() => onPick(day)}
              className={cn(
                "flex size-8 cursor-pointer items-center justify-center rounded-md text-[12px] tabular-nums outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring/55",
                isSelected
                  ? "bg-primary font-medium text-primary-foreground"
                  : cn(
                      "hover:bg-accent hover:text-foreground",
                      inMonth ? "text-foreground/80" : "text-muted-foreground/40",
                      isToday && "font-semibold text-foreground ring-1 ring-inset ring-border",
                    ),
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center gap-1 border-t border-border/60 pt-1.5">
        <button type="button" onClick={() => onPick(today)} className={footerButtonClass}>
          Today
        </button>
        <button type="button" onClick={onClear} className={footerButtonClass}>
          Clear
        </button>
      </div>
    </div>
  );
}
