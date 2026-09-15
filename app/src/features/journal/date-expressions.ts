/**
 * The forgiving date grammar behind the journal's "Go to…" field. Pure calendar
 * math over `DateKey` strings, with no clock of its own: callers pass both the
 * day the journal is showing (`context`, which anchors every relative term and
 * supplies the year an expression leaves out) and the real today, so the parser
 * stays deterministic and testable.
 *
 * The grammar is deliberately journal-specific rather than a general natural
 * language date parser: a closed set of numeric layouts, relative terms,
 * weekday and month names, and counted offsets.
 */

import {
  dateKeyOf,
  formatLongDate,
  formatMonthTitle,
  mondayFirstWeekday,
  parseDateKey,
  shiftDay,
  shiftMonthKeepingDay,
  shiftYearKeepingDay,
  weekStart,
  type DateKey,
} from "./dates";

export type JournalDateGranularity = "day" | "month" | "year";

export type JournalDateResolution =
  | {
      ok: true;
      key: DateKey;
      /** What the expression named. Month and year land on the first day. */
      granularity: JournalDateGranularity;
      /** Human phrasing of the destination, for the confirmation preview. */
      label: string;
    }
  | { ok: false; message: string };

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

/** Abbreviations that are not plain prefixes of the full name. */
const WEEKDAY_ALIASES: Record<string, string> = { weds: "wednesday", tues: "tuesday" };

const SMALLEST_YEAR = 1900;
const LARGEST_YEAR = 2999;

function isYearNumber(value: number): boolean {
  return value >= SMALLEST_YEAR && value <= LARGEST_YEAR;
}

/**
 * A name matched by any prefix of at least three letters, so `thu`, `thurs`,
 * and `thursday` all resolve while `t` stays ambiguous and is rejected.
 */
function indexByPrefix(names: readonly string[], word: string): number | null {
  if (word.length < 3) {
    return null;
  }
  const matches = names.filter((name) => name.startsWith(word));
  return matches.length === 1 ? names.indexOf(matches[0]!) : null;
}

function monthIndex(word: string): number | null {
  return indexByPrefix(MONTH_NAMES, word);
}

function weekdayIndex(word: string): number | null {
  return indexByPrefix(WEEKDAY_NAMES, WEEKDAY_ALIASES[word] ?? word);
}

const MONTH_LABELS = MONTH_NAMES.map((name) => name[0]!.toUpperCase() + name.slice(1));

function dayResult(key: DateKey): JournalDateResolution {
  return { ok: true, key, granularity: "day", label: formatLongDate(key) };
}

function invalid(message: string): JournalDateResolution {
  return { ok: false, message };
}

/**
 * A calendar day, or an error when the numbers name a date that does not exist.
 * Rejecting rather than rolling over is deliberate: `02-30` must not silently
 * become March 2.
 */
function dayFromParts(year: number, month: number, day: number): JournalDateResolution {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return invalid("That date doesn't exist.");
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return invalid(`${MONTH_LABELS[month - 1]} ${day} isn't a real date in ${year}.`);
  }
  return dayResult(dateKeyOf(date));
}

function monthResult(year: number, month: number): JournalDateResolution {
  return {
    ok: true,
    key: dateKeyOf(new Date(year, month, 1)),
    granularity: "month",
    label: formatMonthTitle({ year, month }),
  };
}

function yearResult(year: number): JournalDateResolution {
  return {
    ok: true,
    key: dateKeyOf(new Date(year, 0, 1)),
    granularity: "year",
    label: `${year}`,
  };
}

function contextYear(context: DateKey): number {
  return parseDateKey(context).getFullYear();
}

/** A two-digit year read as this century, so `2-12-25` means 2025. */
function expandYear(value: number): number {
  return value < 100 ? 2000 + value : value;
}

/**
 * The weekday `index` inside the calendar week containing `context`, shifted by
 * `weekOffset` whole weeks. Weeks are Monday-first, matching the journal
 * calendar — so "next week thursday" is the Thursday of the following calendar
 * week, never merely the next Thursday to come.
 */
function weekdayInWeek(context: DateKey, index: number, weekOffset: number): DateKey {
  return shiftDay(weekStart(context), weekOffset * 7 + index);
}

/** The next occurrence of a weekday strictly after `context`. */
function nextWeekday(context: DateKey, index: number): DateKey {
  const distance = (index - mondayFirstWeekday(context) + 7) % 7;
  return shiftDay(context, distance === 0 ? 7 : distance);
}

/** The most recent occurrence of a weekday strictly before `context`. */
function previousWeekday(context: DateKey, index: number): DateKey {
  const distance = (mondayFirstWeekday(context) - index + 7) % 7;
  return shiftDay(context, distance === 0 ? -7 : -distance);
}

/** The next occurrence of a calendar month strictly after the context month. */
function nextMonthOccurrence(context: DateKey, month: number): JournalDateResolution {
  const date = parseDateKey(context);
  const year = date.getFullYear() + (month > date.getMonth() ? 0 : 1);
  return monthResult(year, month);
}

/** The most recent occurrence of a calendar month strictly before the context month. */
function previousMonthOccurrence(context: DateKey, month: number): JournalDateResolution {
  const date = parseDateKey(context);
  const year = date.getFullYear() - (month < date.getMonth() ? 0 : 1);
  return monthResult(year, month);
}

type Direction = -1 | 0 | 1;

const DIRECTIONS: Record<string, Direction> = {
  next: 1,
  last: -1,
  previous: -1,
  prev: -1,
  this: 0,
  current: 0,
};

type Unit = "day" | "week" | "month" | "year";

const UNITS: Record<string, Unit> = {
  day: "day",
  days: "day",
  week: "week",
  weeks: "week",
  month: "month",
  months: "month",
  year: "year",
  years: "year",
};

function shiftUnits(context: DateKey, unit: Unit, amount: number): DateKey {
  switch (unit) {
    case "day":
      return shiftDay(context, amount);
    case "week":
      return shiftDay(context, amount * 7);
    case "month":
      return shiftMonthKeepingDay(context, amount);
    case "year":
      return shiftYearKeepingDay(context, amount);
  }
}

/**
 * Numeric layouts, which are separator-tolerant but order-sensitive. Bare digit
 * runs follow the shapes users type on a numeric keypad; separated forms put the
 * four-digit year wherever it appears and read the rest around it.
 */
function resolveNumeric(input: string, context: DateKey): JournalDateResolution | null {
  const parts = input.split(/[\s\-/.]+/).filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  const numbers = parts.map((part) => Number(part));
  if (parts.length === 1) {
    return resolveDigitRun(parts[0]!, numbers[0]!, context);
  }
  if (parts.length === 2) {
    const [first, second] = numbers as [number, number];
    if (parts[0]!.length === 4 && isYearNumber(first)) {
      return second >= 1 && second <= 12
        ? monthResult(first, second - 1)
        : invalid("That date doesn't exist.");
    }
    if (parts[1]!.length === 4 && isYearNumber(second)) {
      return first >= 1 && first <= 12
        ? monthResult(second, first - 1)
        : invalid("That date doesn't exist.");
    }
    return dayFromParts(contextYear(context), first, second);
  }
  if (parts.length === 3) {
    const [first, second, third] = numbers as [number, number, number];
    if (parts[0]!.length === 4) {
      return dayFromParts(first, second, third);
    }
    return dayFromParts(expandYear(third), second, first);
  }
  return invalid("That date has too many parts.");
}

/**
 * An unseparated digit run: one or two digits is a day of the context month,
 * three is `MDD`, and four is a year when it plausibly reads as one and `MMDD`
 * otherwise — so `312` and `0312` both land on March 12 while `2025` is a year.
 */
function resolveDigitRun(
  text: string,
  value: number,
  context: DateKey,
): JournalDateResolution {
  const date = parseDateKey(context);
  if (text.length <= 2) {
    return dayFromParts(date.getFullYear(), date.getMonth() + 1, value);
  }
  if (text.length === 3) {
    return dayFromParts(date.getFullYear(), Number(text.slice(0, 1)), Number(text.slice(1)));
  }
  if (text.length === 4) {
    return isYearNumber(value)
      ? yearResult(value)
      : dayFromParts(
          date.getFullYear(),
          Number(text.slice(0, 2)),
          Number(text.slice(2)),
        );
  }
  if (text.length === 8) {
    return dayFromParts(
      Number(text.slice(0, 4)),
      Number(text.slice(4, 6)),
      Number(text.slice(6)),
    );
  }
  return invalid("That doesn't look like a date.");
}

/** `today`, `yesterday`, `tomorrow` — the only terms anchored on the real today. */
function resolveAnchor(word: string, today: DateKey): JournalDateResolution | null {
  if (word === "today" || word === "now") {
    return dayResult(today);
  }
  if (word === "yesterday") {
    return dayResult(shiftDay(today, -1));
  }
  if (word === "tomorrow") {
    return dayResult(shiftDay(today, 1));
  }
  return null;
}

/** `2 weeks ago` and `in 3 months`, both measured from the context day. */
function resolveCountedOffset(
  words: readonly string[],
  context: DateKey,
): JournalDateResolution | null {
  if (words.length !== 3) {
    return null;
  }
  const [first, second, third] = words as [string, string, string];
  if (first === "in" && /^\d+$/.test(second) && UNITS[third]) {
    return dayResult(shiftUnits(context, UNITS[third]!, Number(second)));
  }
  if (third === "ago" && /^\d+$/.test(first) && UNITS[second]) {
    return dayResult(shiftUnits(context, UNITS[second]!, -Number(first)));
  }
  return null;
}

/**
 * A direction word followed by what it moves: a unit, a weekday, `week` plus a
 * weekday, or a month name.
 */
function resolveDirected(
  direction: Direction,
  rest: readonly string[],
  context: DateKey,
): JournalDateResolution | null {
  if (rest.length === 2 && (rest[0] === "week" || rest[0] === "weeks")) {
    const index = weekdayIndex(rest[1]!);
    return index === null ? null : dayResult(weekdayInWeek(context, index, direction));
  }
  if (rest.length !== 1) {
    return null;
  }
  const word = rest[0]!;
  const unit = UNITS[word];
  if (unit) {
    return dayResult(shiftUnits(context, unit, direction));
  }
  const weekday = weekdayIndex(word);
  if (weekday !== null) {
    if (direction === 0) {
      return dayResult(weekdayInWeek(context, weekday, 0));
    }
    return dayResult(
      direction === 1 ? nextWeekday(context, weekday) : previousWeekday(context, weekday),
    );
  }
  const month = monthIndex(word);
  if (month !== null) {
    if (direction === 0) {
      return monthResult(contextYear(context), month);
    }
    return direction === 1
      ? nextMonthOccurrence(context, month)
      : previousMonthOccurrence(context, month);
  }
  return null;
}

/**
 * A month name with an optional day and year in either order: `dec`,
 * `dec 2025`, `dec 12`, `12 dec`, `december 12 2025`, `12 december 2025`.
 */
function resolveNamedMonth(
  words: readonly string[],
  context: DateKey,
): JournalDateResolution | null {
  const position = words.findIndex((word) => monthIndex(word) !== null);
  if (position < 0) {
    return null;
  }
  const month = monthIndex(words[position]!)!;
  const numbers = words.filter((_, index) => index !== position);
  if (numbers.some((word) => !/^\d+$/.test(word)) || numbers.length > 2) {
    return null;
  }
  const values = numbers.map((word) => Number(word));
  const yearAt = values.findIndex(
    (value, index) => numbers[index]!.length === 4 && isYearNumber(value),
  );
  const year = yearAt < 0 ? contextYear(context) : values[yearAt]!;
  const days = values.filter((_, index) => index !== yearAt);
  if (days.length === 0) {
    return monthResult(year, month);
  }
  if (days.length > 1) {
    return invalid("That date has too many parts.");
  }
  return dayFromParts(year, month + 1, days[0]!);
}

function resolveWords(
  words: readonly string[],
  context: DateKey,
  today: DateKey,
): JournalDateResolution | null {
  if (words.length === 1) {
    const anchor = resolveAnchor(words[0]!, today);
    if (anchor) {
      return anchor;
    }
    const weekday = weekdayIndex(words[0]!);
    if (weekday !== null) {
      return dayResult(weekdayInWeek(context, weekday, 0));
    }
  }
  const counted = resolveCountedOffset(words, context);
  if (counted) {
    return counted;
  }
  const direction = DIRECTIONS[words[0]!];
  if (direction !== undefined) {
    const directed = resolveDirected(direction, words.slice(1), context);
    if (directed) {
      return directed;
    }
  }
  return resolveNamedMonth(words, context);
}

/**
 * Resolves one "Go to…" expression. `context` is the day the journal is
 * currently showing — it anchors every relative term and supplies the year an
 * expression omits — while `today` anchors only `today`/`yesterday`/`tomorrow`.
 */
export function resolveJournalDateExpression(
  input: string,
  context: DateKey,
  today: DateKey,
): JournalDateResolution {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return invalid("Type a date, like “tomorrow”, “next week thursday”, or “3/12”.");
  }
  const numeric = resolveNumeric(normalized, context);
  if (numeric) {
    return numeric;
  }
  const words = resolveWords(normalized.split(" "), context, today);
  if (words) {
    return words;
  }
  return invalid(`“${input.trim()}” isn't a date the journal understands.`);
}

export type JournalDateSuggestion = {
  expression: string;
  description: string;
};

/**
 * The shortlist the empty "Go to…" field shows, teaching the grammar's shapes
 * rather than listing every accepted term.
 */
export const JOURNAL_DATE_SUGGESTIONS: readonly JournalDateSuggestion[] = [
  { expression: "today", description: "Jump back to today's entry" },
  { expression: "yesterday", description: "The day before today" },
  { expression: "next week thursday", description: "A weekday in a nearby week" },
  { expression: "last friday", description: "The most recent Friday" },
  { expression: "3 days ago", description: "A counted step from this entry" },
  { expression: "3/12", description: "A date, year filled in from this entry" },
  { expression: "dec 2025", description: "A month, opening on its first day" },
];
