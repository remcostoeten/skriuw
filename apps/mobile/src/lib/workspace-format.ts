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

export function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
