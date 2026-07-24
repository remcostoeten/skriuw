import { bindDebouncedPersistence, type PersistenceOptions } from "./debounced-persistence";
import type { RendererStore } from "./types";

type Persist = (folderIds: readonly string[]) => Promise<void>;

/**
 * Persists the set of expanded sidebar folders as native UI state:
 * synchronous local updates, one coalesced background write after a short
 * delay, and a final flush on unbind.
 */
export function bindSidebarExpansionPersistence(
  store: RendererStore,
  persist: Persist,
  options: PersistenceOptions = {},
): () => void {
  return bindDebouncedPersistence(
    store,
    (state) => state.expandedIds,
    (state) => [...state.expandedIds].sort(),
    persist,
    options,
  );
}
