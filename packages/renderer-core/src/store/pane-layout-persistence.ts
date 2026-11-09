import {
  bindDebouncedPersistence,
  type PersistenceBinding,
  type PersistenceOptions,
} from "./debounced-persistence";
import { type PaneLayout, type PaneState, serializePaneLayout } from "./panes";
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

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left === right || (left.length === right.length && left.every((id, i) => id === right[i]));
}

function isNavigationOnlyPaneChange(previous: PaneState, next: PaneState): boolean {
  if (previous.paneId !== next.paneId || !sameIds(previous.pinnedNoteIds, next.pinnedNoteIds)) {
    return false;
  }
  if (previous.openNoteIds.length !== next.openNoteIds.length) {
    return false;
  }
  const replacedIndex =
    previous.activeNoteId === null ? -1 : previous.openNoteIds.indexOf(previous.activeNoteId);
  return previous.openNoteIds.every(
    (id, index) => id === next.openNoteIds[index] || index === replacedIndex,
  );
}

/**
 * @name isNavigationOnlyLayoutChange
 * @description Reports whether a pane layout change only moved which note is
 * active: switching tabs, or replacing the active tab in place. Opening,
 * closing, pinning, or reordering tabs and changing the split are structural.
 *
 * @example
 * if (isNavigationOnlyLayoutChange(previous, next)) {
 *   persistWhenIdle(next);
 * }
 */
export function isNavigationOnlyLayoutChange(previous: PaneLayout, next: PaneLayout): boolean {
  return (
    previous.orientation === next.orientation &&
    previous.ratio === next.ratio &&
    previous.panes.length === next.panes.length &&
    previous.panes.every((pane, index) => {
      const nextPane = next.panes[index];
      return nextPane !== undefined && isNavigationOnlyPaneChange(pane, nextPane);
    })
  );
}

/**
 * Persists the pane layout as native UI state, mirroring the sidebar
 * expansion binder: synchronous local updates, one coalesced background
 * write after a short delay, and a final flush on unbind. Note navigation
 * only moves the active note, so it waits for an idle moment instead of
 * writing between key presses; the final flush still makes it durable.
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
    { ...options, equality: sameLayout, isBackgroundChange: isNavigationOnlyLayoutChange },
  );
}
