import { useRouteFocus } from "@/app-route";
import { isDateKey, todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";

export function useSelectedJournalKey(): DateKey {
  const focus = useRouteFocus();
  return focus !== null && isDateKey(focus) ? focus : todayKey();
}
