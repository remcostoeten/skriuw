import type { RendererState } from "@skriuw/renderer-core/store/types";
import { autoLockMinutes, sealedNoteIds } from "./lock-model";
import { hydrateLockedDocuments, refreshNoteLock, relockNotes } from "./lock-session";
import type { AppPhase, LockSession, Observable, ScreenGuard } from "./port";

/**
 * What a suspended process does with the key.
 *
 * Two platform moments, two different answers, because they are two different
 * risks.
 *
 * `inactive` arrives while the app switcher is being opened, a system prompt
 * is coming up, or Control Centre is being pulled down — and on iOS the
 * snapshot that ends up in the switcher is taken during it. The answer has to
 * be on screen in the same frame, so it is a cover drawn over the shell, not a
 * relock: relocking here would also fire every time the platform raises the
 * biometric prompt, which is itself an `inactive`.
 *
 * `background` means the process is going away. That is where the key is
 * dropped and the opened bodies are replaced by the placeholders the sealed
 * rows actually hold, which is what empties the editor webview. Coming back
 * therefore requires an unlock, which is the whole point.
 *
 * An idle timer covers the third case the phone shares with the desktop: the
 * screen left unlocked on a table.
 */

/**
 * React Native's `AppState` status as one of the three phases this feature
 * acts on. `unknown` and `extension` fold into `inactive` rather than
 * `active`: an unrecognised state is one where the screen may be captured, and
 * covering the shell for a moment too long is the cheap mistake.
 */
export function appPhase(status: string): AppPhase {
  switch (status) {
    case "active":
      return "active";
    case "background":
      return "background";
    default:
      return "inactive";
  }
}

export type LockLifecycle = {
  /** Applies the current phase and returns the teardown. */
  start: () => () => void;
  /** Resets the idle countdown. The shell calls it on real interaction. */
  noteActivity: () => void;
  /** Drops the key now, for a settings row or a test. */
  relockNow: () => Promise<void>;
};

export type LockLifecycleOptions = {
  session: LockSession;
  phase: Observable<AppPhase>;
  /**
   * Raises or lowers the cover over the shell. Called synchronously from the
   * phase listener: anything asynchronous here misses the snapshot.
   */
  setConcealed: (concealed: boolean) => void;
  /** The platform's own screen protection, when the shell has bound one. */
  screenGuard?: ScreenGuard;
  timers?: Pick<typeof globalThis, "setTimeout" | "clearTimeout">;
  reportError?: (context: string, error: unknown) => void;
};

type SessionFacts = {
  unlocked: boolean;
  sealedCount: number;
  autoLockMinutes: number;
};

function selectSessionFacts(state: RendererState): SessionFacts {
  return {
    unlocked: state.noteLock.unlocked,
    sealedCount: sealedNoteIds(state).length,
    autoLockMinutes: autoLockMinutes(state.settings),
  };
}

function sameFacts(left: SessionFacts, right: SessionFacts): boolean {
  return (
    left.unlocked === right.unlocked &&
    left.sealedCount === right.sealedCount &&
    left.autoLockMinutes === right.autoLockMinutes
  );
}

export function createLockLifecycle(options: LockLifecycleOptions): LockLifecycle {
  const timers = options.timers ?? globalThis;
  const { session } = options;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hydrating = false;
  let running = false;

  function report(context: string, error: unknown): void {
    if (options.reportError) {
      options.reportError(context, error);
      return;
    }
    session.reportFailure(error);
  }

  function clearIdleTimer(): void {
    if (idleTimer !== null) {
      timers.clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function relock(): Promise<void> {
    return relockNotes(session).catch((error: unknown) => {
      report("relock", error);
    });
  }

  function armIdleTimer(): void {
    clearIdleTimer();
    const facts = selectSessionFacts(session.store.getState());
    if (!running || !facts.unlocked || facts.autoLockMinutes <= 0) {
      return;
    }
    idleTimer = timers.setTimeout(() => {
      void relock();
    }, facts.autoLockMinutes * 60_000);
  }

  /**
   * Fetches the opened bodies whenever sealed placeholders appear while the
   * key is held — after a sync delta, a re-bootstrap, or a note that was just
   * locked on another device.
   */
  function hydrateIfNeeded(): void {
    const facts = selectSessionFacts(session.store.getState());
    if (!facts.unlocked || facts.sealedCount === 0 || hydrating) {
      return;
    }
    hydrating = true;
    hydrateLockedDocuments(session)
      .catch((error: unknown) => {
        report("locked note hydration", error);
      })
      .finally(() => {
        hydrating = false;
      });
  }

  function applyPhase(phase: AppPhase): void {
    const concealed = phase !== "active";
    options.setConcealed(concealed);
    if (options.screenGuard) {
      if (concealed) {
        options.screenGuard.conceal();
      } else {
        options.screenGuard.reveal();
      }
    }
    if (phase === "background") {
      clearIdleTimer();
      void relock();
      return;
    }
    if (phase === "active") {
      armIdleTimer();
    }
  }

  return {
    start() {
      running = true;
      const stopWatchingSession = session.store.subscribe(
        selectSessionFacts,
        () => {
          hydrateIfNeeded();
          armIdleTimer();
        },
        sameFacts,
      );
      const stopWatchingPhase = options.phase.subscribe(applyPhase);
      refreshNoteLock(session).catch((error: unknown) => {
        report("note lock refresh", error);
      });
      applyPhase(options.phase.current());
      hydrateIfNeeded();

      return () => {
        running = false;
        stopWatchingSession();
        stopWatchingPhase();
        clearIdleTimer();
      };
    },

    noteActivity() {
      if (idleTimer !== null) {
        armIdleTimer();
      }
    },

    relockNow: relock,
  };
}
