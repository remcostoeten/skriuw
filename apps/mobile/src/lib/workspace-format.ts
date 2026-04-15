import { createId, toDateKey } from "@/core/shared/time";

export function formatDate(dateLike: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateLike));
}

export function formatDateKey(dateKey: string) {
  return formatDate(`${dateKey}T12:00:00.000Z`);
}

export { createId, toDateKey };
