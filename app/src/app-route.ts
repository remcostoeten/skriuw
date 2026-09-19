import { useSyncExternalStore } from "react";
import {
  type AppRoute,
  resolveAppRoute,
  resolveHistoryVersion,
  resolveRouteFocus,
} from "@skriuw/renderer-core/route/app-route";

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

function readHistoryVersion(): string | null {
  return resolveHistoryVersion(window.location.hash);
}

export function useRouteHistoryVersion(): string | null {
  return useSyncExternalStore(subscribe, readHistoryVersion, () => null);
}

/**
 * Moves to a route without adding a history entry, the way a native tab bar
 * switches destinations: back then leaves the app rather than replaying every
 * tab visited. `replaceState` fires no `hashchange`, so one is dispatched.
 */
export function replaceRouteHash(hash: string): void {
  if (window.location.hash === hash) {
    return;
  }
  window.history.replaceState(null, "", hash);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
