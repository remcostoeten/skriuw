import { useSyncExternalStore } from "react";

export type AppRoute = "notes" | "trash" | "tags" | "people";

export function resolveAppRoute(hash: string): AppRoute {
  if (hash === "#/trash") {
    return "trash";
  }
  if (hash === "#/tags") {
    return "tags";
  }
  if (hash === "#/people") {
    return "people";
  }
  return "notes";
}

function readRoute(): AppRoute {
  return resolveAppRoute(window.location.hash);
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function useAppRoute(): AppRoute {
  return useSyncExternalStore(subscribe, readRoute, () => "notes");
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
  return "#/notes";
}
