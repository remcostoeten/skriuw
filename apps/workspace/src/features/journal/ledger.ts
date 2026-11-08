import { createLedgerRegistry } from "@/shared/ui/settings-ledger";

export type JournalView = "day" | "history";

export type JournalGroupId =
  | "entry"
  | "mood"
  | "goal"
  | "on-this-day"
  | "tags"
  | "totals"
  | "trend"
  | "entries";

export const JOURNAL_VIEWS: readonly { id: JournalView; label: string }[] = [
  { id: "day", label: "This day" },
  { id: "history", label: "History" },
];

const HISTORY_GROUPS: readonly string[] = ["totals", "trend", "entries"];

export const JOURNAL_SCROLLER_SELECTOR = "[data-journal-scroller]";

/** Every journal page group registers here, so the sidebar outline lists exactly what is on screen. */
export const journalLedger = createLedgerRegistry();

/**
 * @name journalViewOf
 * @description The outline view a page group belongs to: the groups about the
 * open day, or the groups that span every day.
 *
 * @example
 * journalViewOf("trend"); // "history"
 */
export function journalViewOf(groupId: string): JournalView {
  return HISTORY_GROUPS.includes(groupId) ? "history" : "day";
}
