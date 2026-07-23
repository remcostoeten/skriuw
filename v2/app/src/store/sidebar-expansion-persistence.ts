import type { RendererStore } from "./types";

type Persist = (folderIds: readonly string[]) => Promise<void>;

type Options = {
  delayMs?: number;
  onError?: (error: unknown) => void;
};

export function bindSidebarExpansionPersistence(
  store: RendererStore,
  persist: Persist,
  options: Options = {},
): () => void {
  const delayMs = options.delayMs ?? 160;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: readonly string[] | null = null;
  let inFlight = false;
  let stopped = false;

  const drain = async (): Promise<void> => {
    if (inFlight || pending === null || stopped) {
      return;
    }
    const folderIds = pending;
    pending = null;
    inFlight = true;
    try {
      await persist(folderIds);
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
    (state) => state.expandedIds,
    () => {
      pending = [...store.getState().expandedIds].sort();
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
    const finalFolderIds = pending;
    pending = null;
    stopped = true;
    if (finalFolderIds !== null) {
      void persist(finalFolderIds).catch((error) => options.onError?.(error));
    }
  };
}
