import {
  bindDebouncedPersistence,
  type PersistenceBinding,
  type PersistenceOptions,
} from "./debounced-persistence";
import { type PaneLayout, serializePaneLayout } from "./panes";
import type { RendererState, RendererStore } from "./types";

type Persist = (layoutJson: string) => Promise<void>;

export function paneLayout(state: RendererState): PaneLayout {
  return {
    panes: state.panes,
    orientation: state.splitOrientation,
    ratio: state.splitRatio,
  };
}

function sameLayout(left: PaneLayout, right: PaneLayout): boolean {
  return (
    left.panes === right.panes &&
    left.orientation === right.orientation &&
    left.ratio === right.ratio
  );
}

/**
 * Persists the pane layout as native UI state, mirroring the sidebar
 * expansion binder: synchronous local updates, one coalesced background
 * write after a short delay, and a final flush on unbind.
 */
export function bindPaneLayoutPersistence(
  store: RendererStore,
  persist: Persist,
  options: PersistenceOptions = {},
): PersistenceBinding {
  return bindDebouncedPersistence(
    store,
    paneLayout,
    (state) => serializePaneLayout(paneLayout(state)),
    persist,
    { ...options, equality: sameLayout },
  );
}
