export function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
