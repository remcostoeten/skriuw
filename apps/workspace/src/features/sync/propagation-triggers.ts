import {
  refreshWorkspaceSync,
  setWorkspaceSyncOnline,
  setWorkspaceSyncVisibility,
} from "@/bridge/commands";
import { flushPendingWork } from "@/shell/pending-work";

export const PROPAGATION_FLUSH_DEBOUNCE_MS = 250;

type EventSource = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

type VisibilitySource = EventSource & {
  visibilityState: string;
  hasFocus(): boolean;
};

type ConnectivitySource = {
  onLine: boolean;
};

type Timers = {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
};

export type PropagationTriggerDependencies = {
  window: EventSource;
  document: VisibilitySource;
  navigator: ConnectivitySource;
  flush: () => Promise<void>;
  refresh: () => Promise<unknown>;
  setOnline: (online: boolean) => Promise<void>;
  setVisibility: (visible: boolean, focused: boolean) => Promise<void>;
  timers: Timers;
  onError: (context: string, error: unknown) => void;
  debounceMs: number;
};

function defaultDependencies(): PropagationTriggerDependencies {
  const globals = globalThis as unknown as {
    window: EventSource;
    document: VisibilitySource;
    navigator: ConnectivitySource;
  };
  return {
    window: globals.window,
    document: globals.document,
    navigator: globals.navigator,
    flush: flushPendingWork,
    refresh: refreshWorkspaceSync,
    setOnline: setWorkspaceSyncOnline,
    setVisibility: setWorkspaceSyncVisibility,
    timers: {
      setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs) as unknown as number,
      clearTimeout: (handle) => globalThis.clearTimeout(handle),
    },
    onError: (context, error) => console.error(`${context} failed`, error),
    debounceMs: PROPAGATION_FLUSH_DEBOUNCE_MS,
  };
}

/**
 * Turns the moments a user stops looking at the window into propagation
 * points: leaving the window or hiding the tab flushes pending editor work and
 * asks the coordinator for a cycle, so the other device sees the note as it
 * was left rather than after the next poll. The flush is trailing-debounced
 * because blur and visibilitychange usually fire together. Connectivity and
 * visibility are forwarded as scheduling hints for the coordinator's polling.
 */
export function bindPropagationTriggers(
  overrides: Partial<PropagationTriggerDependencies> = {},
): () => void {
  const deps = { ...defaultDependencies(), ...overrides };
  let flushTimer: number | null = null;

  function scheduleFlushAndRefresh(): void {
    if (flushTimer !== null) deps.timers.clearTimeout(flushTimer);
    flushTimer = deps.timers.setTimeout(() => {
      flushTimer = null;
      void deps
        .flush()
        .catch((error) => deps.onError("propagation flush", error))
        .then(() => deps.refresh())
        .catch((error) => deps.onError("propagation refresh", error));
    }, deps.debounceMs);
  }

  function reportVisibility(): void {
    void deps
      .setVisibility(deps.document.visibilityState === "visible", deps.document.hasFocus())
      .catch((error) => deps.onError("sync visibility report", error));
  }

  function reportConnectivity(): void {
    void deps
      .setOnline(deps.navigator.onLine)
      .catch((error) => deps.onError("sync connectivity report", error));
  }

  const handleBlur = () => {
    reportVisibility();
    scheduleFlushAndRefresh();
  };
  const handleFocus = () => {
    reportVisibility();
  };
  const handleVisibilityChange = () => {
    reportVisibility();
    if (deps.document.visibilityState === "hidden") scheduleFlushAndRefresh();
  };

  deps.window.addEventListener("blur", handleBlur);
  deps.window.addEventListener("focus", handleFocus);
  deps.window.addEventListener("online", reportConnectivity);
  deps.window.addEventListener("offline", reportConnectivity);
  deps.document.addEventListener("visibilitychange", handleVisibilityChange);
  reportVisibility();
  reportConnectivity();

  return () => {
    deps.window.removeEventListener("blur", handleBlur);
    deps.window.removeEventListener("focus", handleFocus);
    deps.window.removeEventListener("online", reportConnectivity);
    deps.window.removeEventListener("offline", reportConnectivity);
    deps.document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (flushTimer !== null) {
      deps.timers.clearTimeout(flushTimer);
      flushTimer = null;
    }
  };
}
