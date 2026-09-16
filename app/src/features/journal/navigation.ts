import { journalDayHash, resolveRouteFocus } from "@/app-route";
import {
  isDateKey,
  shiftDay,
  shiftMonthKeepingDay,
  shiftYearKeepingDay,
  todayKey,
  type DateKey,
} from "./dates";

const FOCUS_SEARCH_EVENT = "skriuw:journal-focus-search";
const GO_TO_DATE_EVENT = "skriuw:journal-go-to-date";

/** The day the journal route is showing, falling back to today. */
export function currentJournalDay(): DateKey {
  const focus = resolveRouteFocus(window.location.hash);
  return focus !== null && isDateKey(focus) ? focus : todayKey();
}

export function openJournalDay(key: DateKey): void {
  window.location.hash = journalDayHash(key);
}

export function openJournalDayOffset(offset: number): void {
  openJournalDay(shiftDay(currentJournalDay(), offset));
}

/** Steps whole months, clamping the day so January 31 lands on the last day of February. */
export function openJournalMonthOffset(offset: number): void {
  openJournalDay(shiftMonthKeepingDay(currentJournalDay(), offset));
}

/** Steps whole years, clamping February 29 to February 28. */
export function openJournalYearOffset(offset: number): void {
  openJournalDay(shiftYearKeepingDay(currentJournalDay(), offset));
}

export function openJournalToday(): void {
  openJournalDay(todayKey());
}

/** Asks the mounted journal view to open its "Go to date…" dialog. */
export function requestJournalGoToDate(): void {
  window.dispatchEvent(new CustomEvent(GO_TO_DATE_EVENT));
}

export function onJournalGoToDate(listener: () => void): () => void {
  window.addEventListener(GO_TO_DATE_EVENT, listener);
  return () => window.removeEventListener(GO_TO_DATE_EVENT, listener);
}

/**
 * Asks the journal sidebar to reveal its search tab and put the caret in the
 * field. A window event rather than a prop so the command registry can reach
 * the sidebar's local state without the whole journal tree being lifted.
 */
export function requestJournalSearchFocus(): void {
  window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT));
}

export function onJournalSearchFocus(listener: () => void): () => void {
  window.addEventListener(FOCUS_SEARCH_EVENT, listener);
  return () => window.removeEventListener(FOCUS_SEARCH_EVENT, listener);
}
