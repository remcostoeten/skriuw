import { journalDayHash, resolveRouteFocus } from "../app-route";
import { isDateKey, shiftDay, todayKey, type DateKey } from "./dates";

const FOCUS_SEARCH_EVENT = "skriuw:journal-focus-search";

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

export function openJournalToday(): void {
  openJournalDay(todayKey());
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
