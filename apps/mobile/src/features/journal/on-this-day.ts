/**
 * What a day recalls, shared word for word with
 * `apps/workspace/src/features/journal/on-this-day.ts` and specified in
 * `docs/specs/journal-daily.md` under "On this day".
 */

import { shiftDay, shiftMonthKeepingDay, type DateKey } from "@skriuw/renderer-core/journal/dates";
import type { JournalEntry } from "./model";

export type Anniversary = {
  entry: JournalEntry;
  label: string;
};

const EXCERPT_LIMIT = 160;

function yearsAgoLabel(years: number): string {
  return years === 1 ? "A year ago" : `${years} years ago`;
}

/**
 * Entries that fall a week, a month, or whole years before `dateKey`, nearest
 * first. A month ago only counts when the day of the month exists there, so
 * March 29-31 never all point at the same late-February entry. Pure over the
 * already-projected entry list: no I/O on the navigation path.
 */
export function onThisDay(entries: readonly JournalEntry[], dateKey: DateKey): Anniversary[] {
  const byDate = new Map(entries.map((entry) => [entry.dateKey, entry]));
  const found: Anniversary[] = [];
  const weekAgo = byDate.get(shiftDay(dateKey, -7));
  if (weekAgo) {
    found.push({ entry: weekAgo, label: "A week ago" });
  }
  const monthAgoKey = shiftMonthKeepingDay(dateKey, -1);
  const monthAgo = byDate.get(monthAgoKey);
  if (monthAgo && monthAgoKey.slice(8) === dateKey.slice(8)) {
    found.push({ entry: monthAgo, label: "A month ago" });
  }
  const year = Number(dateKey.slice(0, 4));
  const monthDay = dateKey.slice(4);
  const earlierYears = entries
    .filter((entry) => entry.dateKey.slice(4) === monthDay && entry.dateKey < dateKey)
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey));
  for (const entry of earlierYears) {
    found.push({ entry, label: yearsAgoLabel(year - Number(entry.dateKey.slice(0, 4))) });
  }
  return found;
}

/**
 * A one-paragraph plain-text preview of an entry's Markdown body. The title
 * heading and a template's untouched `...` placeholders say nothing about the
 * day, so they stay out.
 */
export function entryExcerpt(markdown: string): string {
  const text = markdown
    .replace(/^\s*# [^\n]*\n?/, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/, "")
        .replace(/^\[[ xX]\]\s+/, "")
        .trim(),
    )
    .filter((line) => line.length > 0 && !/^(```|~~~|---|\*\*\*|\.\.\.$)/.test(line))
    .join(" ")
    .replace(/[*_`~]+/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= EXCERPT_LIMIT) {
    return text;
  }
  const cut = text.slice(0, EXCERPT_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > EXCERPT_LIMIT / 2 ? lastSpace : EXCERPT_LIMIT).trimEnd()}…`;
}
