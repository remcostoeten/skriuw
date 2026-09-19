import type { Equality, RendererState, RendererStore } from "./types";

export type PersistenceOptions = {
  delayMs?: number;
  onError?: (error: unknown) => void;
};

export type PersistenceBinding = {
  flush: () => Promise<void>;
  dispose: () => Promise<void>;
};

/**
 * Subscribes to a store slice and persists snapshots of it in the background:
 * synchronous local updates, one coalesced write after a short delay, and a
 * final flush on unbind. Writes never overlap; a snapshot taken while one is
 * in flight drains as soon as it settles. `flush` and `dispose` reject while
 * the latest accepted snapshot is not durable, so callers must await or catch
 * them; `onError` is an additional background-reporting hook. Slices that are
 * built per read rather than held in the store pass an `equality` so the
 * subscription still only fires on real changes.
 */
export function bindDebouncedPersistence<Slice, Snapshot>(
  store: RendererStore,
  select: (state: RendererState) => Slice,
  snapshot: (state: RendererState) => Snapshot,
  persist: (value: Snapshot) => Promise<void>,
  options: PersistenceOptions & { equality?: Equality<Slice> } = {},
): PersistenceBinding {
  const delayMs = options.delayMs ?? 160;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Snapshot | null = null;
  let inFlight: Promise<void> | null = null;
  let failed: { value: Snapshot; error: unknown } | null = null;
  let disposed = false;

  const drain = async (): Promise<void> => {
    if (inFlight !== null) {
      await inFlight;
      return;
    }
    if (pending === null) {
      return;
    }
    const value = pending;
    pending = null;
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
        if (pending !== null && !disposed) {
          void drain();
        }
      });
    await inFlight;
  };

  const unsubscribe = store.subscribe(
    select,
    () => {
      pending = snapshot(store.getState());
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void drain();
      }, delayMs);
    },
    options.equality,
  );

  async function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = null;
    if (pending === null && inFlight === null && failed !== null) {
      pending = failed.value;
    }
    while (pending !== null || inFlight !== null) {
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
