import { isDueDate } from "@skriuw/renderer-core/tasks/due-dates";
import type { DateKey } from "@skriuw/renderer-core/journal/dates";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { selectJournalEntries } from "@/features/journal/model";

let dueCache: { tasks: RendererState["tasks"]; today: DateKey; count: number } | null = null;

/**
 * @name dueTaskCount
 * @description Open tasks due today or earlier, for the badge on the Tasks
 * rail item. Recounts only when the task map or the day changes.
 *
 * @example
 * dueTaskCount(store.getState(), "2026-11-09"); // 3
 */
export function dueTaskCount(state: RendererState, today: DateKey): number {
  if (dueCache !== null && dueCache.tasks === state.tasks && dueCache.today === today) {
    return dueCache.count;
  }
  let count = 0;
  for (const task of state.tasks.values()) {
    if (task.status !== "done" && isDueDate(task.dueDate) && task.dueDate <= today) {
      count += 1;
    }
  }
  dueCache = { tasks: state.tasks, today, count };
  return count;
}

/**
 * @name journalTodayUnwritten
 * @description Whether someone who keeps a journal has not written today's
 * entry yet. Stays false for a workspace without journal entries, so the rail
 * never nags people who do not journal.
 *
 * @example
 * journalTodayUnwritten(store.getState(), "2026-11-09"); // true
 */
export function journalTodayUnwritten(state: RendererState, today: DateKey): boolean {
  const entries = selectJournalEntries(state);
  return entries.length > 0 && !entries.some((entry) => entry.dateKey === today);
}
