import type { WorkspaceOperationEnvelope } from "../contracts/workspace";
import { envelope } from "../contracts/workspace";
import type { RendererStore } from "../store/types";
import { flushPendingWork } from "./pending-work";

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
        reject(new Error("active note persistence timed out"));
      }, timeoutMs);
    }),
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    },
  };
}

async function persistBeforeClose(
  store: RendererStore,
  persist: PersistOperations,
  timeoutMs: number,
): Promise<void> {
  const state = store.getState();
  const timeout = timeoutAfter(timeoutMs);
  try {
    await Promise.race([
      flushPendingWork().then(() => {
        if (!state.settings.rememberLastNote) {
          return undefined;
        }
        return persist([
          envelope({
            type: "set_active_note",
            noteId: state.activeNoteId,
          }),
        ]);
      }),
      timeout.promise,
    ]);
  } finally {
    timeout.cancel();
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLOSE_PERSISTENCE_TIMEOUT_MS;
  const onError = options.onError ?? (() => {});
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
      try {
        await persistBeforeClose(store, persist, timeoutMs);
      } catch (error) {
        onError(error);
        closing = false;
        return;
      }
      try {
        await windowPort.completeClose();
      } catch (error) {
        closing = false;
        onError(error);
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
    unlisten();
  };
}
