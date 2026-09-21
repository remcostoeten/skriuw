/**
 * The foreground-only wake channel.
 *
 * It is a latency optimization and never a correctness path: every failure
 * falls back to the coordinator's own poll interval and to the catch-up the
 * lifecycle runs on resume, so a channel that never connects costs staleness
 * and nothing else. It exists only while the application is in the foreground
 * because both platforms suspend the socket behind it and iOS will not restore
 * one.
 *
 * Both the socket and the timer are ports. React Native's `WebSocket` takes a
 * third options argument for headers that the DOM one does not, and tests must
 * not wait in real time for a backoff.
 */

export type WakeSocket = {
  close: () => void;
};

export type WakeSocketHandlers = {
  onOpen: () => void;
  /** One inbound frame, already a string. */
  onMessage: (data: string) => void;
  /**
   * @param authorized False when the service refused the credential at the
   * handshake, so reconnecting with the same one cannot succeed.
   */
  onClose: (authorized: boolean) => void;
};

/** Opens one authenticated socket. The bearer is attached by the shell. */
export type WakeSocketFactory = (
  url: string,
  bearer: string,
  handlers: WakeSocketHandlers,
) => WakeSocket;

export type WakeTimer = {
  /** Returns a cancel function. */
  schedule: (delayMs: number, run: () => void) => () => void;
};

export type WakeChannel = {
  /** Idempotent: opening an open channel is not a second socket. */
  open: () => void;
  close: () => void;
  connected: () => boolean;
};

export type WakeChannelOptions = {
  /** `null` while nothing is connected, which keeps the channel closed. */
  target: () => Promise<{ url: string; bearer: string } | null>;
  socket: WakeSocketFactory;
  timer: WakeTimer;
  /** Fed to the coordinator, which uses it only to pick a poll interval. */
  onConnected: (connected: boolean) => void;
  onRemoteChange: () => void;
  reportError?: (error: unknown) => void;
};

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export function createWakeChannel(options: WakeChannelOptions): WakeChannel {
  let socket: WakeSocket | null = null;
  let cancelRetry: (() => void) | null = null;
  let backoffMs = MIN_BACKOFF_MS;
  let open = false;
  let connected = false;
  /** Rising counter so a resolved `target()` from a closed run is ignored. */
  let generation = 0;

  function report(next: boolean): void {
    if (connected === next) return;
    connected = next;
    options.onConnected(next);
  }

  function retry(forGeneration: number): void {
    cancelRetry?.();
    cancelRetry = options.timer.schedule(backoffMs, () => {
      cancelRetry = null;
      if (forGeneration !== generation) return;
      connect();
    });
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  function connect(): void {
    const forGeneration = generation;
    options
      .target()
      .then((target) => {
        if (forGeneration !== generation || !open) return;
        if (target === null) {
          // Nothing is connected yet. The lifecycle reopens the channel after
          // the next connect, so there is nothing to retry towards here.
          return;
        }
        socket = options.socket(target.url, target.bearer, {
          onOpen: () => {
            if (forGeneration !== generation) return;
            backoffMs = MIN_BACKOFF_MS;
            report(true);
          },
          onMessage: (data) => {
            if (forGeneration !== generation) return;
            if (isWorkspaceChanged(data)) {
              options.onRemoteChange();
            }
          },
          onClose: (authorized) => {
            if (forGeneration !== generation) return;
            socket = null;
            report(false);
            // A refused handshake means this credential is gone. The
            // coordinator learns the same thing from its next cycle and
            // surfaces it; retrying here would only burn battery.
            if (authorized) retry(forGeneration);
          },
        });
      })
      .catch((error: unknown) => {
        options.reportError?.(error);
        if (forGeneration !== generation || !open) return;
        retry(forGeneration);
      });
  }

  return {
    open() {
      if (open) return;
      open = true;
      generation += 1;
      backoffMs = MIN_BACKOFF_MS;
      connect();
    },

    close() {
      if (!open) return;
      open = false;
      generation += 1;
      cancelRetry?.();
      cancelRetry = null;
      socket?.close();
      socket = null;
      report(false);
    },

    connected: () => connected,
  };
}

/**
 * The service sends other frames — its own keepalive answers among them — and
 * only a workspace change is worth a cycle.
 */
export function isWorkspaceChanged(data: string): boolean {
  try {
    const parsed = JSON.parse(data) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === "workspaceChanged"
    );
  } catch {
    return false;
  }
}
