import {
  dateKeyOf,
  isDateKey,
  mondayFirstWeekday,
  parseDateKey,
  shiftDay,
  type DateKey,
} from "@skriuw/renderer-core/journal/dates";

export const RECURRENCE_SIGNIFIER = "🔁";

type RecurrenceUnit = "day" | "week" | "month" | "year";

type RecurrenceRule =
  | { kind: "weekday" }
  | { kind: "interval"; count: number; unit: RecurrenceUnit };

const MAX_INTERVAL = 999;

const UNIT_ALIASES: Record<string, RecurrenceUnit> = {
  day: "day",
  days: "day",
  daily: "day",
  week: "week",
  weeks: "week",
  weekly: "week",
  month: "month",
  months: "month",
  monthly: "month",
  year: "year",
  years: "year",
  yearly: "year",
  annually: "year",
};

const ADVERBS: Record<RecurrenceUnit, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};

function ruleFromWords(words: string): RecurrenceRule | null {
  const normalized = words.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
  if (normalized === "weekday" || normalized === "weekdays") {
    return { kind: "weekday" };
  }
  const match = /^(?:(\d{1,3}) ?)?([a-z]+)$/.exec(normalized);
  if (!match) {
    return null;
  }
  const unit = UNIT_ALIASES[match[2] ?? ""];
  const count = match[1] === undefined ? 1 : Number(match[1]);
  if (unit === undefined || count < 1 || count > MAX_INTERVAL) {
    return null;
  }
  return { kind: "interval", count, unit };
}

function ruleText(rule: RecurrenceRule): string {
  if (rule.kind === "weekday") {
    return "every weekday";
  }
  return rule.count === 1 ? `every ${rule.unit}` : `every ${rule.count} ${rule.unit}s`;
}

function parseRule(recurrence: string): RecurrenceRule | null {
  const match = /^every (.+)$/.exec(recurrence);
  return match ? ruleFromWords(match[1] ?? "") : null;
}

/**
 * @name isRecurrence
 * @description True when `value` is a rule in the canonical Obsidian Tasks
 * spelling Skriuw writes after `🔁`: `every day`, `every weekday`, or
 * `every [N] day|week|month|year[s]`.
 *
 * @example
 * isRecurrence("every 2 weeks"); // true
 * isRecurrence("every fortnight"); // false
 */
export function isRecurrence(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const rule = parseRule(value);
  return rule !== null && ruleText(rule) === value;
}

/**
 * @name normalizeRecurrence
 * @description Reads a rule as it appears after `🔁` in Markdown, in any letter
 * case or spacing, into its canonical spelling.
 *
 * @example
 * normalizeRecurrence("Every Week"); // "every week"
 */
export function normalizeRecurrence(text: string): string | null {
  const match = /^every\s+(.+)$/i.exec(text.trim());
  const rule = match ? ruleFromWords(match[1] ?? "") : null;
  return rule ? ruleText(rule) : null;
}

/**
 * @name resolveRecurrenceExpression
 * @description Reads what a user typed after `every:` into a rule. Adverbs,
 * units, weekdays, and counts with `_` for the space are all accepted.
 *
 * @example
 * resolveRecurrenceExpression("weekly"); // "every week"
 * resolveRecurrenceExpression("2_weeks"); // "every 2 weeks"
 */
export function resolveRecurrenceExpression(expression: string): string | null {
  const rule = ruleFromWords(expression);
  return rule ? ruleText(rule) : null;
}

function addMonths(from: DateKey, months: number): DateKey {
  const date = parseDateKey(from);
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return dateKeyOf(target);
}

/**
 * @name nextOccurrence
 * @description The due date of the occurrence after one due on `from`. Months
 * and years keep the day of the month, clamped to the month's last day.
 *
 * @example
 * nextOccurrence("every week", "2026-10-01"); // "2026-10-08"
 * nextOccurrence("every month", "2026-01-31"); // "2026-02-28"
 * nextOccurrence("every weekday", "2026-10-02"); // "2026-10-05"
 */
export function nextOccurrence(recurrence: string, from: DateKey): DateKey | null {
  const rule = parseRule(recurrence);
  if (rule === null || !isDateKey(from)) {
    return null;
  }
  if (rule.kind === "weekday") {
    const weekday = mondayFirstWeekday(from);
    return shiftDay(from, weekday >= 4 ? 7 - weekday : 1);
  }
  switch (rule.unit) {
    case "day":
      return shiftDay(from, rule.count);
    case "week":
      return shiftDay(from, rule.count * 7);
    case "month":
      return addMonths(from, rule.count);
    case "year":
      return addMonths(from, rule.count * 12);
  }
}

/**
 * @name formatRecurrenceLabel
 * @description The compact label the recurrence chip shows.
 *
 * @example
 * formatRecurrenceLabel("every week"); // "Weekly"
 * formatRecurrenceLabel("every 3 days"); // "Every 3 days"
 */
export function formatRecurrenceLabel(recurrence: string): string {
  const rule = parseRule(recurrence);
  if (rule === null) {
    return recurrence;
  }
  if (rule.kind === "weekday") {
    return "Weekdays";
  }
  return rule.count === 1 ? ADVERBS[rule.unit] : `Every ${rule.count} ${rule.unit}s`;
}
