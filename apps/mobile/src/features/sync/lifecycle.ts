import type { MobileSyncPort, WorkspaceSyncStatus } from "./port";
import type { WakeChannel } from "./wake-channel";

/**
 * What keeps a phone converged.
 *
 * A desktop process runs until it is quit; a phone's is suspended mid-cycle
 * and resumed minutes or days later, with every socket dead and every timer
 * skipped. So the correctness path is the catch-up that runs on resume, and
 * everything faster than it — the wake channel, a silent push, a background
 * task — is an optimization that is allowed to never happen.
 *
 * Every signal is funnelled through one queue. Foreground, background and
 * reachability changes arrive in bursts on both platforms, and two overlapping
 * resume sequences would leave the coordinator polling at a visibility that
 * belongs to the other one.
 */

export type LifecyclePort<T> = {
  current: () => T;
  /** Returns an unsubscribe. */
  subscribe: (listener: (value: T) => void) => () => void;
};

export type SyncLifecycle = {
  /** Applies the current state and returns the teardown. */
  start: () => () => void;
  /**
   * Runs the resume catch-up now. The shell also calls this after a silent
   * push that arrived while the application was in the foreground.
   */
  catchUp: () => Promise<void>;
  /** Best-effort background cycle, for a task the platform may cut short. */
  backgroundRefresh: () => Promise<WorkspaceSyncStatus>;
};

export type SyncLifecycleOptions = {
  port: MobileSyncPort;
  /** True while the application is in the foreground. */
  foreground: LifecyclePort<boolean>;
  /** The shell's reachability hint. Advice to the coordinator, not a gate. */
  online: LifecyclePort<boolean>;
  wakeChannel: WakeChannel;
  onStatus?: (status: WorkspaceSyncStatus) => void;
  reportError?: (error: unknown) => void;
};

export function createSyncLifecycle(options: SyncLifecycleOptions): SyncLifecycle {
  let queue: Promise<void> = Promise.resolve();
  let running = false;

  function enqueue(step: () => Promise<void>): Promise<void> {
    queue = queue.then(async () => {
      if (!running) return;
      try {
        await step();
      } catch (error) {
        // A lifecycle signal must never take the application down with it.
        // The coordinator keeps its own schedule and the next signal retries.
        options.reportError?.(error);
      }
    });
    return queue;
  }

  function publish(status: WorkspaceSyncStatus): void {
    options.onStatus?.(status);
  }

  async function enterForeground(): Promise<void> {
    await options.port.setWorkspaceSyncVisibility(true, true);
    publish(await options.port.catchUpWorkspaceSync());
    // Opened after the catch-up, so a channel that connects instantly cannot
    // move the coordinator onto its slow "channel connected" poll interval
    // before the resume cycle has run.
    options.wakeChannel.open();
  }

  async function enterBackground(): Promise<void> {
    options.wakeChannel.close();
    await options.port.setWorkspaceSyncVisibility(false, false);
  }

  return {
    start() {
      running = true;
      const unsubscribe = [
        options.foreground.subscribe((foreground) => {
          void enqueue(() => (foreground ? enterForeground() : enterBackground()));
        }),
        options.online.subscribe((online) => {
          void enqueue(async () => {
            await options.port.setWorkspaceSyncOnline(online);
            if (online && options.foreground.current()) {
              publish(await options.port.catchUpWorkspaceSync());
            }
          });
        }),
      ];

      void enqueue(async () => {
        await options.port.setWorkspaceSyncOnline(options.online.current());
        if (options.foreground.current()) {
          await enterForeground();
        } else {
          await enterBackground();
        }
      });

      return () => {
        running = false;
        for (const stop of unsubscribe) stop();
        options.wakeChannel.close();
      };
    },

    catchUp: () =>
      enqueue(async () => {
        publish(await options.port.catchUpWorkspaceSync());
      }),

    /**
     * Deliberately outside the queue: the platform hands a background task its
     * own short window, and spending it waiting behind a foreground sequence
     * that was itself suspended would waste the one chance to catch up early.
     */
    async backgroundRefresh() {
      const status = await options.port.backgroundRefreshWorkspaceSync();
      publish(status);
      return status;
    },
  };
}
