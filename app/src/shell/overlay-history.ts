import { COMPACT_SHELL_QUERY } from "./shell-layout";

const STATE_KEY = "skriuwOverlay";

type OverlayState = Record<typeof STATE_KEY, string>;

export type HistoryView = {
  history: Pick<History, "state" | "pushState" | "back">;
  addEventListener: (type: "popstate", listener: () => void) => void;
  removeEventListener: (type: "popstate", listener: () => void) => void;
};

export type OverlayHistory = {
  /** Claims a history entry for an overlay that is now open. Returns the release for when it closes. */
  open: (onBack: () => void) => () => void;
};

/** The overlay an entry was pushed for, or null for ordinary navigation. */
export function overlayIdOf(state: unknown): string | null {
  if (typeof state !== "object" || state === null || !(STATE_KEY in state)) {
    return null;
  }
  const id = (state as Partial<OverlayState>)[STATE_KEY];
  return typeof id === "string" ? id : null;
}

function overlayState(id: string): OverlayState {
  return { [STATE_KEY]: id };
}

/**
 * Gives every open overlay one history entry, so the platform back gesture
 * closes the sheet, dialog, or palette on top instead of leaving the app.
 *
 * Opening pushes an entry and closing by any other route pops it again, so
 * the stack the user walks back through never contains an overlay that is no
 * longer on screen. Two things keep that honest: an overlay that closed
 * under a newer navigation leaves its entry buried, and that entry is skipped
 * when a later back lands on it; and an overlay opened while a pop is still
 * in flight defers its push until the pop completes, because a push made
 * before then would be undone by it.
 */
export function createOverlayHistory(view: HistoryView): OverlayHistory {
  const open = new Map<string, () => void>();
  const session = Math.random().toString(36).slice(2, 8);
  let sequence = 0;
  let listening = false;
  let pendingBack = false;
  let deferred: string[] = [];

  function onPopState(): void {
    const current = overlayIdOf(view.history.state);
    if (pendingBack) {
      pendingBack = false;
      if (deferred.length > 0) {
        for (const id of deferred) {
          view.history.pushState(overlayState(id), "");
        }
        deferred = [];
        return;
      }
    }
    if (current !== null && !open.has(current)) {
      pendingBack = true;
      view.history.back();
      return;
    }
    for (const [id, onBack] of open) {
      if (id !== current) {
        open.delete(id);
        onBack();
      }
    }
  }

  return {
    open(onBack) {
      if (!listening) {
        listening = true;
        view.addEventListener("popstate", onPopState);
      }
      const id = `${session}-${++sequence}`;
      open.set(id, onBack);
      if (pendingBack) {
        deferred.push(id);
      } else {
        view.history.pushState(overlayState(id), "");
      }
      return () => {
        if (!open.delete(id)) {
          return;
        }
        if (deferred.includes(id)) {
          deferred = deferred.filter((entry) => entry !== id);
          return;
        }
        if (overlayIdOf(view.history.state) === id) {
          pendingBack = true;
          view.history.back();
        }
      };
    },
  };
}

let shared: OverlayHistory | null = null;

/** The window's overlay history, created on first use so tests never touch it. */
export function overlayHistory(): OverlayHistory {
  return (shared ??= createOverlayHistory(window));
}

/**
 * Claims a back-gesture entry for an overlay in the compact shell. Outside it
 * there is no back button to honour, and a desktop browser's back should keep
 * meaning navigation, so nothing is pushed.
 */
export function bindOverlayBack(onBack: () => void): () => void {
  if (typeof matchMedia !== "function" || !matchMedia(COMPACT_SHELL_QUERY).matches) {
    return () => {};
  }
  return overlayHistory().open(onBack);
}
