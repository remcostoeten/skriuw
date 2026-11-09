import { useEffect, useState } from "react";
import { todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";

function millisecondsUntilTomorrow(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime() + 1000;
}

/**
 * @name useToday
 * @description Today's `DateKey`, re-rendering once just after local midnight
 * so views that compare against today roll over without a reload.
 *
 * @example
 * const today = useToday();
 * const overdue = dueDate < today;
 */
export function useToday(): DateKey {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const timer = window.setTimeout(() => setToday(todayKey()), millisecondsUntilTomorrow());
    return () => window.clearTimeout(timer);
  }, [today]);
  return today;
}
