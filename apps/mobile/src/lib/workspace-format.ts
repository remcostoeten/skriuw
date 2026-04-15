import { createId, toDateKey } from "../../../../src/core/shared/time";

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

export function getNoteTitle(name: string, content: string) {
  const trimmedName = name.trim();
  if (trimmedName.length > 0) {
    return trimmedName;
  }

  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "New note";
  }

  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

export function getNotePreview(content: string) {
  const normalized = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  return normalized.length > 0 ? normalized : "No additional text";
}

export { createId, toDateKey };
