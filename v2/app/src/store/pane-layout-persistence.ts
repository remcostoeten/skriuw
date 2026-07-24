import { bindDebouncedPersistence, type PersistenceOptions } from "./debounced-persistence";
import { serializePaneLayout } from "./panes";
import type { RendererStore } from "./types";

type Persist = (layoutJson: string) => Promise<void>;

/**
 * Persists the pane layout as native UI state, mirroring the sidebar
 * expansion binder: synchronous local updates, one coalesced background
 * write after a short delay, and a final flush on unbind.
 */
export function bindPaneLayoutPersistence(
  store: RendererStore,
  persist: Persist,
  options: PersistenceOptions = {},
): () => void {
  return bindDebouncedPersistence(
    store,
    (state) => state.panes,
    (state) => serializePaneLayout(state.panes),
    persist,
    options,
  );
}
