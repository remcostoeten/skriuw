import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { autoLockMinutes, locksOnBlur } from "@/features/settings/settings-model";
import { sealedNoteIds } from "../state/model";
import { hydrateLockedDocuments, refreshNoteLock, relockNotes } from "./backend";

type LockSessionDependencies = {
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  document: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  timers: Pick<typeof globalThis, "setTimeout" | "clearTimeout">;
  now: () => number;
  relock: (store: RendererStore) => Promise<void>;
  hydrate: (store: RendererStore) => Promise<void>;
  refresh: (store: RendererStore) => Promise<unknown>;
  onError: (context: string, error: unknown) => void;
};

function defaultDependencies(overrides: Partial<LockSessionDependencies>): LockSessionDependencies {
  return {
    window: overrides.window ?? window,
    document: overrides.document ?? document,
    timers: overrides.timers ?? globalThis,
    now: overrides.now ?? Date.now,
    relock: overrides.relock ?? relockNotes,
    hydrate: overrides.hydrate ?? ((store) => hydrateLockedDocuments(store)),
    refresh: overrides.refresh ?? refreshNoteLock,
    onError: overrides.onError ?? ((context, error) => console.error(`${context} failed`, error)),
  };
}

const ACTIVITY_EVENTS = ["keydown", "pointerdown", "wheel"] as const;

function selectSessionFacts(state: RendererState) {
  return {
    unlocked: state.noteLock.unlocked,
    sealedCount: sealedNoteIds(state).length,
    autoLockMinutes: autoLockMinutes(state.settings),
    lockOnBlur: locksOnBlur(state.settings),
  };
}

type SessionFacts = ReturnType<typeof selectSessionFacts>;

function sameFacts(left: SessionFacts, right: SessionFacts): boolean {
  return (
    left.unlocked === right.unlocked &&
    left.sealedCount === right.sealedCount &&
    left.autoLockMinutes === right.autoLockMinutes &&
    left.lockOnBlur === right.lockOnBlur
  );
}

/**
 * Keeps the renderer's view of locked notes in step with the session: opened
 * bodies are fetched whenever sealed placeholders appear while the key is
 * held (after a sync delta or a re-bootstrap), and the key is dropped after
 * the configured idle time or when the window loses focus or the tab is hidden.
 * Browsers throttle and freeze timers in hidden tabs, so the idle deadline is
 * also checked against the wall clock when the tab becomes visible again.
 */
export function bindLockSession(
  store: RendererStore,
  overrides: Partial<LockSessionDependencies> = {},
): () => void {
  const deps = defaultDependencies(overrides);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleDeadline: number | null = null;
  let hydrating = false;
  let relocking = false;

  function clearIdleTimer(): void {
    if (idleTimer !== null) {
      deps.timers.clearTimeout(idleTimer);
      idleTimer = null;
    }
    idleDeadline = null;
  }

  function relock(): void {
    if (relocking) {
      return;
    }
    relocking = true;
    void deps
      .relock(store)
      .catch((error) => deps.onError("auto-lock", error))
      .finally(() => {
        relocking = false;
      });
  }

  function armIdleTimer(): void {
    clearIdleTimer();
    const facts = selectSessionFacts(store.getState());
    if (!facts.unlocked || facts.autoLockMinutes <= 0) {
      return;
    }
    const delay = facts.autoLockMinutes * 60_000;
    idleDeadline = deps.now() + delay;
    idleTimer = deps.timers.setTimeout(relock, delay);
  }

  function hydrateIfNeeded(): void {
    const facts = selectSessionFacts(store.getState());
    if (!facts.unlocked || facts.sealedCount === 0 || hydrating) {
      return;
    }
    hydrating = true;
    void deps
      .hydrate(store)
      .catch((error) => deps.onError("locked note hydration", error))
      .finally(() => {
        hydrating = false;
      });
  }

  function onActivity(): void {
    if (idleTimer !== null) {
      armIdleTimer();
    }
  }

  function onBlur(): void {
    if (selectSessionFacts(store.getState()).lockOnBlur) {
      relock();
    }
  }

  function onVisibilityChange(): void {
    if (deps.document.visibilityState === "hidden") {
      onBlur();
      return;
    }
    if (idleDeadline !== null && deps.now() >= idleDeadline) {
      relock();
    }
  }

  const unsubscribe = store.subscribe(
    selectSessionFacts,
    () => {
      hydrateIfNeeded();
      armIdleTimer();
    },
    sameFacts,
  );
  for (const event of ACTIVITY_EVENTS) {
    deps.document.addEventListener(event, onActivity, { passive: true });
  }
  deps.window.addEventListener("blur", onBlur);
  deps.document.addEventListener("visibilitychange", onVisibilityChange);
  void deps.refresh(store).catch((error) => deps.onError("note lock refresh", error));
  hydrateIfNeeded();
  armIdleTimer();

  return () => {
    unsubscribe();
    clearIdleTimer();
    for (const event of ACTIVITY_EVENTS) {
      deps.document.removeEventListener(event, onActivity);
    }
    deps.window.removeEventListener("blur", onBlur);
    deps.document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
