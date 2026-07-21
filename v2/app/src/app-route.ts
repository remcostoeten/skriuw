import { useSyncExternalStore } from "react";

export type AppRoute = "notes" | "trash";

export function resolveAppRoute(hash: string): AppRoute {
  return hash === "#/trash" ? "trash" : "notes";
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
  return route === "trash" ? "#/trash" : "#/notes";
}
