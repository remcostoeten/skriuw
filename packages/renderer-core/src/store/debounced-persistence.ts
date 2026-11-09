import type { Equality, RendererState, RendererStore } from "./types";

export type IdleScheduler = (run: () => void) => () => void;

export type PersistenceOptions = {
  delayMs?: number;
  idleDelayMs?: number;
  scheduleIdle?: IdleScheduler;
  onError?: (error: unknown) => void;
};

export type PersistenceBinding = {
  flush: () => Promise<void>;
  dispose: () => Promise<void>;
};

type DebouncedPersistenceOptions<Slice> = PersistenceOptions & {
  equality?: Equality<Slice>;
  isBackgroundChange?: (previous: Slice, next: Slice) => boolean;
};

function scheduleAfterDelay(delayMs: number, run: () => void): () => void {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
}

/**
 * Subscribes to a store slice and persists snapshots of it in the background:
 * synchronous local updates, one coalesced write after a short delay, and a
 * final flush on unbind. The snapshot is taken when the write starts, never in
 * the update that changed the slice. Changes that `isBackgroundChange` marks
 * as background work, such as moving the active note, wait `idleDelayMs` and
 * then for `scheduleIdle`, so rapid navigation neither serializes nor writes
 * until the user pauses. Writes never overlap; a change accepted while one is
 * in flight drains as soon as it settles. `flush` and `dispose` reject while
 * the latest accepted change is not durable, so callers must await or catch
 * them; `onError` is an additional background-reporting hook. Slices that are
 * built per read rather than held in the store pass an `equality` so the
 * subscription still only fires on real changes.
 */
export function bindDebouncedPersistence<Slice, Snapshot>(
  store: RendererStore,
  select: (state: RendererState) => Slice,
  snapshot: (state: RendererState) => Snapshot,
  persist: (value: Snapshot) => Promise<void>,
  options: DebouncedPersistenceOptions<Slice> = {},
): PersistenceBinding {
  const delayMs = options.delayMs ?? 160;
  const idleDelayMs = options.idleDelayMs ?? 1_500;
  const scheduleIdle = options.scheduleIdle ?? ((run: () => void) => scheduleAfterDelay(0, run));
  let cancelScheduled: (() => void) | null = null;
  let scheduledInBackground = false;
  let dirty = false;
  let inFlight: Promise<void> | null = null;
  let failed: { value: Snapshot; error: unknown } | null = null;
  let disposed = false;
  let previousSlice = select(store.getState());

  function cancelSchedule(): void {
    cancelScheduled?.();
    cancelScheduled = null;
  }

  function takeSnapshot(): Snapshot | null {
    if (!dirty) {
      return null;
    }
    dirty = false;
    return snapshot(store.getState());
  }

  async function drain(): Promise<void> {
    if (inFlight !== null) {
      await inFlight;
      return;
    }
    const value = takeSnapshot();
    if (value === null) {
      return;
    }
    inFlight = persist(value)
      .then(() => {
        failed = null;
      })
      .catch((error) => {
        failed = { value, error };
        options.onError?.(error);
      })
      .finally(() => {
        inFlight = null;
        if (dirty && !disposed && cancelScheduled === null) {
          void drain();
        }
      });
    await inFlight;
  }

  function runScheduled(): void {
    cancelScheduled = null;
    void drain();
  }

  function scheduleForeground(): void {
    cancelSchedule();
    scheduledInBackground = false;
    cancelScheduled = scheduleAfterDelay(delayMs, runScheduled);
  }

  function scheduleBackground(): void {
    if (cancelScheduled !== null && !scheduledInBackground) {
      return;
    }
    cancelSchedule();
    scheduledInBackground = true;
    let cancelIdle: (() => void) | null = null;
    const cancelDelay = scheduleAfterDelay(idleDelayMs, () => {
      cancelIdle = scheduleIdle(runScheduled);
    });
    cancelScheduled = () => {
      cancelDelay();
      cancelIdle?.();
    };
  }

  const unsubscribe = store.subscribe(
    select,
    () => {
      const nextSlice = select(store.getState());
      const background = options.isBackgroundChange?.(previousSlice, nextSlice) ?? false;
      previousSlice = nextSlice;
      dirty = true;
      if (background) {
        scheduleBackground();
      } else {
        scheduleForeground();
      }
    },
    options.equality,
  );

  async function flush(): Promise<void> {
    cancelSchedule();
    if (!dirty && inFlight === null && failed !== null) {
      const retry = failed.value;
      failed = null;
      inFlight = persist(retry)
        .catch((error) => {
          failed = { value: retry, error };
          options.onError?.(error);
        })
        .finally(() => {
          inFlight = null;
        });
    }
    while (dirty || inFlight !== null) {
      await drain();
    }
    if (failed !== null) {
      throw failed.error;
    }
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    await flush();
  }

  return { flush, dispose };
}
