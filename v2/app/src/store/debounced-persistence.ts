import type { RendererState, RendererStore } from "./types";

export type PersistenceOptions = {
  delayMs?: number;
  onError?: (error: unknown) => void;
};

/**
 * Subscribes to a store slice and persists snapshots of it in the background:
 * synchronous local updates, one coalesced write after a short delay, and a
 * final flush on unbind. Writes never overlap; a snapshot taken while one is
 * in flight drains as soon as it settles.
 */
export function bindDebouncedPersistence<Slice, Snapshot>(
  store: RendererStore,
  select: (state: RendererState) => Slice,
  snapshot: (state: RendererState) => Snapshot,
  persist: (value: Snapshot) => Promise<void>,
  options: PersistenceOptions = {},
): () => void {
  const delayMs = options.delayMs ?? 160;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Snapshot | null = null;
  let inFlight = false;
  let stopped = false;

  const drain = async (): Promise<void> => {
    if (inFlight || pending === null || stopped) {
      return;
    }
    const value = pending;
    pending = null;
    inFlight = true;
    try {
      await persist(value);
    } catch (error) {
      options.onError?.(error);
    } finally {
      inFlight = false;
      if (pending !== null && !stopped) {
        void drain();
      }
    }
  };

  const unsubscribe = store.subscribe(select, () => {
    pending = snapshot(store.getState());
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, delayMs);
  });

  return () => {
    unsubscribe();
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = null;
    const finalValue = pending;
    pending = null;
    stopped = true;
    if (finalValue !== null) {
      void persist(finalValue).catch((error) => options.onError?.(error));
    }
  };
}
