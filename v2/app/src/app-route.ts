import { useSyncExternalStore } from "react";

export type AppRoute = "notes" | "trash";

function readRoute(): AppRoute {
  return window.location.hash === "#/trash" ? "trash" : "notes";
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function useAppRoute(): AppRoute {
  return useSyncExternalStore(subscribe, readRoute, () => "notes");
}
