import { serializePaneLayout } from "./panes";
import type { RendererStore } from "./types";

type Persist = (layoutJson: string) => Promise<void>;

type Options = {
  delayMs?: number;
  onError?: (error: unknown) => void;
};

/**
 * Persists the pane layout as native UI state, mirroring the sidebar
 * expansion binder: synchronous local updates, one coalesced background
 * write after a short delay, and a final flush on unbind.
 */
export function bindPaneLayoutPersistence(
  store: RendererStore,
  persist: Persist,
  options: Options = {},
): () => void {
  const delayMs = options.delayMs ?? 160;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;
  let inFlight = false;
  let stopped = false;

  const drain = async (): Promise<void> => {
    if (inFlight || pending === null || stopped) {
      return;
    }
    const layoutJson = pending;
    pending = null;
    inFlight = true;
    try {
      await persist(layoutJson);
    } catch (error) {
      options.onError?.(error);
    } finally {
      inFlight = false;
      if (pending !== null && !stopped) {
        void drain();
      }
    }
  };

  const unsubscribe = store.subscribe(
    (state) => state.panes,
    () => {
      pending = serializePaneLayout(store.getState().panes);
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void drain();
      }, delayMs);
    },
  );

  return () => {
    unsubscribe();
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = null;
    const finalLayout = pending;
    pending = null;
    stopped = true;
    if (finalLayout !== null) {
      void persist(finalLayout).catch((error) => options.onError?.(error));
    }
  };
}
