import type { WorkspaceOperationEnvelope } from "@/contracts/workspace";
import { envelope } from "@/contracts/workspace";
import type { RendererStore } from "@/store/types";
import { flushBestEffortPendingWork, flushCriticalPendingWork } from "./pending-work";

type CloseRequestedEvent = {
  preventDefault: () => void;
};

type WindowPort = {
  completeClose: () => Promise<void>;
  onCloseRequested: (
    handler: (event: CloseRequestedEvent) => void | Promise<void>,
  ) => Promise<() => void>;
};

type Options = {
  timeoutMs?: number;
  onError?: (error: unknown) => void;
  onCloseError?: (error: unknown) => void;
  onContinuityError?: (error: unknown) => void;
};

type PersistOperations = (
  operations: WorkspaceOperationEnvelope[],
) => Promise<unknown>;

const DEFAULT_CLOSE_PERSISTENCE_TIMEOUT_MS = 2_000;

function timeoutAfter(timeoutMs: number): {
  promise: Promise<never>;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    promise: new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("pending content persistence timed out"));
      }, timeoutMs);
    }),
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    },
  };
}

function resolveAfter(timeoutMs: number): {
  promise: Promise<void>;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    promise: new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Runs the two persistence tiers that precede a close. Unsaved content is the
 * only work allowed to keep the window open: its flush rethrows and the
 * caller cancels the close. UI continuity (best-effort flushes plus the
 * remembered active note) gets a bounded chance to land and is reported
 * instead of trapping the user when it fails or hangs.
 */
async function persistBeforeClose(
  store: RendererStore,
  persist: PersistOperations,
  timeoutMs: number,
  isCurrentAttempt: () => boolean,
  onContinuityError: (error: unknown) => void,
): Promise<void> {
  const timeout = timeoutAfter(timeoutMs);
  try {
    await Promise.race([flushCriticalPendingWork(), timeout.promise]);
  } finally {
    timeout.cancel();
  }
  if (!isCurrentAttempt()) {
    return;
  }
  const work: Promise<unknown>[] = [flushBestEffortPendingWork()];
  const state = store.getState();
  if (state.settings.rememberLastNote) {
    work.push(
      persist([
        envelope({
          type: "set_active_note",
          noteId: state.activeNoteId,
        }),
      ]),
    );
  }
  const continuity = Promise.all(work)
    .then(() => undefined)
    .catch((error) => onContinuityError(error));
  const grace = resolveAfter(timeoutMs);
  try {
    await Promise.race([continuity, grace.promise]);
  } finally {
    grace.cancel();
  }
}

export async function bindWindowClosePersistence(
  store: RendererStore,
  persist: PersistOperations,
  windowPort: WindowPort,
  options: Options = {},
): Promise<() => void> {
  let closing = false;
  let disposed = false;
  let attempt = 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLOSE_PERSISTENCE_TIMEOUT_MS;
  const onError = options.onError ?? (() => {});
  const onCloseError = options.onCloseError ?? onError;
  const onContinuityError = options.onContinuityError ?? (() => {});
  let unlisten: () => void;
  try {
    unlisten = await windowPort.onCloseRequested(async (event) => {
      if (disposed) {
        return;
      }
      event.preventDefault();
      if (closing) {
        return;
      }
      closing = true;
      const currentAttempt = ++attempt;
      try {
        await persistBeforeClose(
          store,
          persist,
          timeoutMs,
          () => !disposed && attempt === currentAttempt,
          onContinuityError,
        );
      } catch (error) {
        attempt += 1;
        onError(error);
        closing = false;
        return;
      }
      try {
        await windowPort.completeClose();
      } catch (error) {
        closing = false;
        onCloseError(error);
      }
    });
  } catch (error) {
    onError(error);
    return () => {};
  }
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    attempt += 1;
    unlisten();
  };
}
