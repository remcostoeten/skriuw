export type AppRoute =
  | "notes"
  | "trash"
  | "tags"
  | "people"
  | "history"
  | "journal"
  | "tasks"
  | "media"
  | "prompt-playground";

export function resolveAppRoute(hash: string): AppRoute {
  if (hash === "#/trash") {
    return "trash";
  }
  if (hash === "#/prompt-playground") {
    return "prompt-playground";
  }
  if (hash === "#/media") {
    return "media";
  }
  if (hash.startsWith("#/history/")) {
    return "history";
  }
  if (hash === "#/tags" || hash.startsWith("#/tags/")) {
    return "tags";
  }
  if (hash === "#/people" || hash.startsWith("#/people/")) {
    return "people";
  }
  if (hash === "#/journal" || hash.startsWith("#/journal/")) {
    return "journal";
  }
  if (hash === "#/tasks" || hash.startsWith("#/tasks/")) {
    return "tasks";
  }
  return "notes";
}

export function resolveRouteFocus(hash: string): string | null {
  const match = /^#\/(?:tags|people|history|journal|tasks)\/([^/]+)(?:\/[^/]*)?$/.exec(hash);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]!);
}

export function resolveHistoryVersion(hash: string): string | null {
  const match = /^#\/history\/[^/]+\/([^/]+)$/.exec(hash);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]!);
}

export function appRouteHash(route: AppRoute): string {
  if (route === "trash") {
    return "#/trash";
  }
  if (route === "tags") {
    return "#/tags";
  }
  if (route === "people") {
    return "#/people";
  }
  if (route === "journal") {
    return "#/journal";
  }
  if (route === "tasks") {
    return "#/tasks";
  }
  if (route === "prompt-playground") {
    return "#/prompt-playground";
  }
  if (route === "media") {
    return "#/media";
  }
  return "#/notes";
}

export function taskFocusHash(taskId: string): string {
  return `#/tasks/${encodeURIComponent(taskId)}`;
}

export function journalDayHash(dateKey: string): string {
  return `#/journal/${encodeURIComponent(dateKey)}`;
}

export function noteHistoryHash(noteId: string, versionId?: string): string {
  const base = `#/history/${encodeURIComponent(noteId)}`;
  return versionId === undefined ? base : `${base}/${encodeURIComponent(versionId)}`;
}

export function entityFocusHash(kind: "tag" | "person", id: string): string {
  const segment = kind === "tag" ? "tags" : "people";
  return `#/${segment}/${encodeURIComponent(id)}`;
}
