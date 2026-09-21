/**
 * Dependency-free calendar math for the journal. Every key is a local-time
 * `YYYY-MM-DD` string so entries stay on the day the user wrote them,
 * independent of time zone.
 *
 * The desktop twin is `apps/workspace/src/features/journal/dates.ts`; the two are read
 * by the same specification (`docs/specs/journal-navigation.md`) and are
 * pinned to each other by `__tests__/parity.test.cts`.
 */

export type DateKey = string;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return (
    parsed.getFullYear() === Number(year) &&
    parsed.getMonth() === Number(month) - 1 &&
    parsed.getDate() === Number(day)
  );
}

export function dateKeyOf(date: Date): DateKey {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${`${date.getFullYear()}`.padStart(4, "0")}-${month}-${day}`;
}

export function todayKey(): DateKey {
  return dateKeyOf(new Date());
}

export function parseDateKey(key: DateKey): Date {
  const match = DATE_KEY_PATTERN.exec(key);
  if (!match) {
    return new Date(NaN);
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function shiftDay(key: DateKey, offset: number): DateKey {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + offset);
  return dateKeyOf(date);
}

export type MonthKey = { year: number; month: number };

export function monthOfKey(key: DateKey): MonthKey {
  const date = parseDateKey(key);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftMonth(current: MonthKey, offset: number): MonthKey {
  const shifted = new Date(current.year, current.month + offset, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() };
}

export function sameMonth(left: MonthKey, right: MonthKey): boolean {
  return left.year === right.year && left.month === right.month;
}

export type CalendarDay = {
  key: DateKey;
  dayOfMonth: number;
  inMonth: boolean;
};

/** The Monday-first grid of whole weeks covering `month`. */
export function monthGrid(month: MonthKey): CalendarDay[] {
  const first = new Date(month.year, month.month, 1);
  const leading = (first.getDay() + 6) % 7;
  const start = new Date(month.year, month.month, 1 - leading);
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;
  const days: CalendarDay[] = [];
  for (let offset = 0; offset < total; offset += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    days.push({
      key: dateKeyOf(date),
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === month.month && date.getFullYear() === month.year,
    });
  }
  return days;
}

export const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

/**
 * The same day-of-month `offset` months away, clamped to the last day when the
 * target month is shorter — so stepping from January 31 lands on February 28
 * rather than overflowing into March.
 */
export function shiftMonthKeepingDay(key: DateKey, offset: number): DateKey {
  const date = parseDateKey(key);
  const target = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return dateKeyOf(target);
}

/** The same month and day `offset` years away, clamping February 29. */
export function shiftYearKeepingDay(key: DateKey, offset: number): DateKey {
  return shiftMonthKeepingDay(key, offset * 12);
}

/** Monday-first weekday index of `key`, 0 for Monday through 6 for Sunday. */
export function mondayFirstWeekday(key: DateKey): number {
  return (parseDateKey(key).getDay() + 6) % 7;
}

/** The Monday starting the week that contains `key`, matching the calendar grid. */
export function weekStart(key: DateKey): DateKey {
  return shiftDay(key, -mondayFirstWeekday(key));
}

const MONTH_TITLE = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const LONG_DATE = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const LIST_DATE = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const WEEKDAY = new Intl.DateTimeFormat("en", { weekday: "long" });

export function formatMonthTitle(month: MonthKey): string {
  return MONTH_TITLE.format(new Date(month.year, month.month, 1));
}

export function formatLongDate(key: DateKey): string {
  return LONG_DATE.format(parseDateKey(key));
}

export function formatListDate(key: DateKey): string {
  return LIST_DATE.format(parseDateKey(key)).replace(",", "").replaceAll("/", " ");
}

/** "Today", "Yesterday", "Tomorrow", or the weekday name. */
export function formatDayHeading(key: DateKey, today: DateKey = todayKey()): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const offset = Math.round((parseDateKey(key).getTime() - parseDateKey(today).getTime()) / dayMs);
  if (offset === 0) {
    return "Today";
  }
  if (offset === -1) {
    return "Yesterday";
  }
  if (offset === 1) {
    return "Tomorrow";
  }
  return WEEKDAY.format(parseDateKey(key));
}
