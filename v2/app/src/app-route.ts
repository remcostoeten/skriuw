import { useSyncExternalStore } from "react";

export type AppRoute = "notes" | "trash" | "tags" | "people" | "history" | "journal";

export function resolveAppRoute(hash: string): AppRoute {
  if (hash === "#/trash") {
    return "trash";
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
  return "notes";
}

export function resolveRouteFocus(hash: string): string | null {
  const match = /^#\/(?:tags|people|history|journal)\/(.+)$/.exec(hash);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]!);
}

function readRoute(): AppRoute {
  return resolveAppRoute(window.location.hash);
}

function readFocus(): string | null {
  return resolveRouteFocus(window.location.hash);
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function useAppRoute(): AppRoute {
  return useSyncExternalStore(subscribe, readRoute, () => "notes");
}

export function useRouteFocus(): string | null {
  return useSyncExternalStore(subscribe, readFocus, () => null);
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
  return "#/notes";
}

export function journalDayHash(dateKey: string): string {
  return `#/journal/${encodeURIComponent(dateKey)}`;
}

export function noteHistoryHash(noteId: string): string {
  return `#/history/${encodeURIComponent(noteId)}`;
}

export function entityFocusHash(kind: "tag" | "person", id: string): string {
  const segment = kind === "tag" ? "tags" : "people";
  return `#/${segment}/${encodeURIComponent(id)}`;
}
