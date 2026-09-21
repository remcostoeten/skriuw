import {
  isDateKey,
  shiftDay,
  shiftMonthKeepingDay,
  shiftYearKeepingDay,
  todayKey,
  type DateKey,
} from "./dates";

/** The search parameter the journal route carries its day in. */
export const JOURNAL_DAY_PARAM = "day";

export type JournalStep =
  | { unit: "day"; amount: number }
  | { unit: "week"; amount: number }
  | { unit: "month"; amount: number }
  | { unit: "year"; amount: number }
  | { unit: "today" };

/**
 * Every destination the desktop step shortcuts reach
 * (`docs/specs/journal-navigation.md`, Step shortcuts). The compact shell has
 * no bracket chords to bind, so the same steps are reached by the header
 * controls, the horizontal swipe and the calendar; the arithmetic, including
 * the month and year clamping, is the one below.
 */
export function stepJournalDay(current: DateKey, step: JournalStep, today: DateKey): DateKey {
  switch (step.unit) {
    case "day":
      return shiftDay(current, step.amount);
    case "week":
      return shiftDay(current, step.amount * 7);
    case "month":
      return shiftMonthKeepingDay(current, step.amount);
    case "year":
      return shiftYearKeepingDay(current, step.amount);
    case "today":
      return today;
  }
}

/**
 * The day a route parameter is asking for. Anything missing or unreadable
 * falls back to today rather than refusing to render, so a malformed deep
 * link still opens the journal.
 */
export function journalDayFromParam(value: string | string[] | undefined): DateKey {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && isDateKey(candidate) ? candidate : todayKey();
}

/** The href a day is reached by, so deep links and the tab bar agree. */
export function journalDayHref(key: DateKey): string {
  return `/journal?${JOURNAL_DAY_PARAM}=${key}`;
}
