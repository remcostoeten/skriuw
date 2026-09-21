/**
 * The forgiving date grammar behind the journal's "Go to date…" dialog. Pure
 * calendar math over `DateKey` strings with no clock of its own; the grammar is
 * specified in `docs/specs/journal-navigation.md`.
 */

import {
  formatLongDate,
  formatMonthTitle,
  isDateKey,
  monthOfKey,
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
      /** What the expression named. Month and year land on their first day. */
      granularity: JournalDateGranularity;
      /** The destination phrased for the preview: a long date, a month title, or a year. */
      label: string;
    }
  | { ok: false; message: string };

type Outcome =
  | { ok: true; key: DateKey; granularity: JournalDateGranularity }
  | { ok: false; message: string };

/** The years a "Go to date…" expression may land in. */
export const JOURNAL_YEAR_RANGE = { min: 1000, max: 9999 } as const;

const BARE_YEAR_RANGE = { min: 1900, max: 2999 } as const;

const TWO_DIGIT_YEAR_LOOKAHEAD = 20;

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

const WEEKDAY_ALIASES: Readonly<Record<string, string>> = {
  weds: "wednesday",
  tues: "tuesday",
};

const MONTH_LABELS = MONTH_NAMES.map((name) => name.charAt(0).toUpperCase() + name.slice(1));

type Direction = -1 | 0 | 1;

const DIRECTIONS: Readonly<Record<string, Direction>> = {
  next: 1,
  last: -1,
  previous: -1,
  prev: -1,
  this: 0,
  current: 0,
};

type Unit = "day" | "week" | "month" | "year";

const UNITS: Readonly<Record<string, Unit>> = {
  day: "day",
  days: "day",
  week: "week",
  weeks: "week",
  month: "month",
  months: "month",
  year: "year",
  years: "year",
};

const DIGITS = /^\d+$/;

function indexByPrefix(names: readonly string[], word: string): number | null {
  if (word.length < 3) {
    return null;
  }
  const matches = names.flatMap((name, index) => (name.startsWith(word) ? [index] : []));
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function monthIndex(word: string): number | null {
  return indexByPrefix(MONTH_NAMES, word);
}

function weekdayIndex(word: string): number | null {
  return indexByPrefix(WEEKDAY_NAMES, WEEKDAY_ALIASES[word] ?? word);
}

function invalid(message: string): Outcome {
  return { ok: false, message };
}

function yearOf(key: DateKey): number {
  return parseDateKey(key).getFullYear();
}

function inYearRange(year: number): boolean {
  return year >= JOURNAL_YEAR_RANGE.min && year <= JOURNAL_YEAR_RANGE.max;
}

function yearRangeMessage(yearText: string): string {
  return `Year ${yearText} is outside the journal's range of ${JOURNAL_YEAR_RANGE.min}–${JOURNAL_YEAR_RANGE.max}.`;
}

function keyOf(year: number, month: number, day: number): DateKey {
  const yyyy = `${year}`.padStart(4, "0");
  const mm = `${month}`.padStart(2, "0");
  const dd = `${day}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayFromParts(year: number, month: number, day: number): Outcome {
  if (!inYearRange(year)) {
    return invalid(yearRangeMessage(`${year}`));
  }
  if (month < 1 || month > 12) {
    return invalid(`There's no month ${month}.`);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return invalid(`${MONTH_LABELS[month - 1]} ${day} isn't a real date in ${year}.`);
  }
  return { ok: true, key: keyOf(year, month, day), granularity: "day" };
}

function monthFromParts(year: number, month: number, yearText: string): Outcome {
  if (!inYearRange(year)) {
    return invalid(yearRangeMessage(yearText));
  }
  if (month < 1 || month > 12) {
    return invalid(`There's no month ${month}.`);
  }
  return { ok: true, key: keyOf(year, month, 1), granularity: "month" };
}

function day(key: DateKey): Outcome {
  return { ok: true, key, granularity: "day" };
}

/**
 * The year a two-digit `value` names: the one ending in those digits inside the
 * hundred years that stop {@link TWO_DIGIT_YEAR_LOOKAHEAD} years after `today`.
 */
export function expandTwoDigitYear(value: number, today: DateKey): number {
  const latest = yearOf(today) + TWO_DIGIT_YEAR_LOOKAHEAD;
  const candidate = Math.floor(latest / 100) * 100 + value;
  return candidate > latest ? candidate - 100 : candidate;
}

function yearFromText(text: string, today: DateKey): number | null {
  if (text.length === 2) {
    return expandTwoDigitYear(Number(text), today);
  }
  return text.length === 4 ? Number(text) : null;
}

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

function weekdayInWeek(context: DateKey, index: number, weekOffset: number): DateKey {
  return shiftDay(weekStart(context), weekOffset * 7 + index);
}

function resolveDigitRun(text: string, context: DateKey): Outcome {
  const { year, month } = monthOfKey(context);
  if (text.length <= 2) {
    return dayFromParts(year, month + 1, Number(text));
  }
  if (text.length === 3) {
    return dayFromParts(year, Number(text.slice(0, 1)), Number(text.slice(1)));
  }
  if (text.length === 4) {
    const value = Number(text);
    if (value >= BARE_YEAR_RANGE.min && value <= BARE_YEAR_RANGE.max) {
      return { ok: true, key: keyOf(value, 1, 1), granularity: "year" };
    }
    const asMonthDay = dayFromParts(year, Number(text.slice(0, 2)), Number(text.slice(2)));
    return asMonthDay.ok
      ? asMonthDay
      : invalid(
          `“${text}” isn't a month and day like 0312, or a year from ${BARE_YEAR_RANGE.min} to ${BARE_YEAR_RANGE.max}.`,
        );
  }
  if (text.length === 8) {
    const yearText = text.slice(0, 4);
    if (!inYearRange(Number(yearText))) {
      return invalid(yearRangeMessage(yearText));
    }
    return dayFromParts(Number(yearText), Number(text.slice(4, 6)), Number(text.slice(6)));
  }
  return invalid("That doesn't look like a date.");
}

function resolveNumeric(input: string, context: DateKey, today: DateKey): Outcome | null {
  const parts = input.split(/[\s\-/.]+/).filter((part) => part.length > 0);
  if (parts.length === 0 || !parts.every((part) => DIGITS.test(part))) {
    return null;
  }
  const [first = "", second = "", third = ""] = parts;
  if (parts.length === 1) {
    return resolveDigitRun(first, context);
  }
  if (parts.length === 2) {
    if (first.length === 4 && second.length <= 2) {
      return monthFromParts(Number(first), Number(second), first);
    }
    if (second.length === 4 && first.length <= 2) {
      return monthFromParts(Number(second), Number(first), second);
    }
    if (first.length <= 2 && second.length <= 2) {
      return dayFromParts(yearOf(context), Number(first), Number(second));
    }
    return invalid("That doesn't look like a date.");
  }
  if (parts.length > 3) {
    return invalid("That date has too many parts.");
  }
  if (second.length > 2) {
    return invalid("That doesn't look like a date.");
  }
  if (first.length === 4) {
    if (!inYearRange(Number(first))) {
      return invalid(yearRangeMessage(first));
    }
    return third.length <= 2
      ? dayFromParts(Number(first), Number(second), Number(third))
      : invalid("That doesn't look like a date.");
  }
  const year = first.length <= 2 ? yearFromText(third, today) : null;
  if (year === null) {
    return invalid("Write the year with two or four digits, like 2-12-25 or 2-12-2025.");
  }
  if (!inYearRange(year)) {
    return invalid(yearRangeMessage(third));
  }
  return dayFromParts(year, Number(second), Number(first));
}

function resolveAnchor(word: string, today: DateKey): Outcome | null {
  switch (word) {
    case "today":
    case "now":
      return day(today);
    case "yesterday":
      return day(shiftDay(today, -1));
    case "tomorrow":
      return day(shiftDay(today, 1));
    default:
      return null;
  }
}

function resolveCountedOffset(words: readonly string[], context: DateKey): Outcome | null {
  if (words.length !== 3) {
    return null;
  }
  const [first = "", second = "", third = ""] = words;
  const forwardUnit = UNITS[third];
  if (first === "in" && DIGITS.test(second) && forwardUnit) {
    return day(shiftUnits(context, forwardUnit, Number(second)));
  }
  const backwardUnit = UNITS[second];
  if (third === "ago" && DIGITS.test(first) && backwardUnit) {
    return day(shiftUnits(context, backwardUnit, -Number(first)));
  }
  return null;
}

function monthOccurrence(context: DateKey, month: number, direction: Direction): Outcome {
  const current = monthOfKey(context);
  const yearShift =
    direction === 1
      ? month > current.month
        ? 0
        : 1
      : direction === -1
        ? month < current.month
          ? 0
          : -1
        : 0;
  const year = current.year + yearShift;
  return monthFromParts(year, month + 1, `${year}`);
}

function resolveDirected(
  direction: Direction,
  rest: readonly string[],
  context: DateKey,
): Outcome | null {
  const [head = "", tail] = rest;
  if (rest.length === 2 && tail !== undefined && UNITS[head] === "week") {
    const index = weekdayIndex(tail);
    return index === null ? null : day(weekdayInWeek(context, index, direction));
  }
  if (rest.length !== 1) {
    return null;
  }
  const unit = UNITS[head];
  if (unit) {
    return day(shiftUnits(context, unit, direction));
  }
  const weekday = weekdayIndex(head);
  if (weekday !== null) {
    return day(weekdayInWeek(context, weekday, direction));
  }
  const month = monthIndex(head);
  return month === null ? null : monthOccurrence(context, month, direction);
}

function resolveNamedMonth(words: readonly string[], context: DateKey): Outcome | null {
  const position = words.findIndex((word) => monthIndex(word) !== null);
  const month = position < 0 ? null : monthIndex(words[position] ?? "");
  if (month === null) {
    return null;
  }
  const numbers = words.filter((_, index) => index !== position);
  if (numbers.length > 2 || !numbers.every((word) => DIGITS.test(word))) {
    return null;
  }
  const yearText = numbers.find((word) => word.length === 4);
  const days = numbers.filter((word) => word !== yearText);
  if (yearText === undefined && numbers.length === 2) {
    return invalid("That date has too many parts.");
  }
  const year = yearText === undefined ? yearOf(context) : Number(yearText);
  const [dayText] = days;
  if (dayText === undefined) {
    return monthFromParts(year, month + 1, yearText ?? `${year}`);
  }
  if (!inYearRange(year)) {
    return invalid(yearRangeMessage(yearText ?? `${year}`));
  }
  return dayFromParts(year, month + 1, Number(dayText));
}

function resolveWords(words: readonly string[], context: DateKey, today: DateKey): Outcome | null {
  const [first = ""] = words;
  if (words.length === 1) {
    const anchor = resolveAnchor(first, today);
    if (anchor) {
      return anchor;
    }
    const weekday = weekdayIndex(first);
    if (weekday !== null) {
      return day(weekdayInWeek(context, weekday, 0));
    }
  }
  const counted = resolveCountedOffset(words, context);
  if (counted) {
    return counted;
  }
  const direction = DIRECTIONS[first];
  if (direction !== undefined) {
    const directed = resolveDirected(direction, words.slice(1), context);
    if (directed) {
      return directed;
    }
  }
  return resolveNamedMonth(words, context);
}

function labelFor(key: DateKey, granularity: JournalDateGranularity): string {
  switch (granularity) {
    case "day":
      return formatLongDate(key);
    case "month":
      return formatMonthTitle(monthOfKey(key));
    case "year":
      return key.slice(0, 4);
  }
}

function finish(outcome: Outcome): JournalDateResolution {
  if (!outcome.ok) {
    return outcome;
  }
  if (!isDateKey(outcome.key) || !inYearRange(yearOf(outcome.key))) {
    return {
      ok: false,
      message: `That lands outside the journal's range of ${JOURNAL_YEAR_RANGE.min}–${JOURNAL_YEAR_RANGE.max}.`,
    };
  }
  return { ...outcome, label: labelFor(outcome.key, outcome.granularity) };
}

/**
 * Resolves one "Go to date…" expression. `context` is the day the journal is
 * showing: it anchors every relative term and supplies an omitted year. `today`
 * anchors only `today`, `now`, `yesterday`, and `tomorrow`, and places
 * two-digit years. Never throws; anything unreadable or out of range comes back
 * as `{ ok: false, message }`.
 */
export function resolveJournalDateExpression(
  input: string,
  context: DateKey,
  today: DateKey,
): JournalDateResolution {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return { ok: false, message: "Type a date, like “tomorrow”, “next week thursday”, or “3/12”." };
  }
  const outcome =
    resolveNumeric(normalized, context, today) ??
    resolveWords(normalized.split(" "), context, today) ??
    invalid(`“${input.trim()}” isn't a date the journal understands.`);
  return finish(outcome);
}

export type JournalDateSuggestion = {
  expression: string;
  description: string;
};

/** The shortlist the empty "Go to date…" field offers, one per grammar shape. */
export const JOURNAL_DATE_SUGGESTIONS: readonly JournalDateSuggestion[] = [
  { expression: "today", description: "Today's entry" },
  { expression: "yesterday", description: "The day before today" },
  { expression: "next week thursday", description: "A weekday in the following week" },
  { expression: "last friday", description: "Friday of the previous week" },
  { expression: "3 days ago", description: "A counted step from this entry" },
  { expression: "3/12", description: "Month and day, in this entry's year" },
  { expression: "dec 2025", description: "A month, opening on its first day" },
];
