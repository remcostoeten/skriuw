import { opensNotesInTabs } from "../settings/settings-model";
import type { RendererStore } from "../store/types";
import {
  PRIMARY_PANE_ID,
  SECONDARY_PANE_ID,
  activateTabInPane,
  closeAllTabs as closeAllTabsInPanes,
  closeOtherTabs as closeOtherTabsInPanes,
  closeSplit as closeSplitPanes,
  closeTab as closeTabInPanes,
  closeTabsToSide as closeTabsToSideInPanes,
  cycleTabId,
  openBeside as openBesidePanes,
  openNoteInTab as openNoteInTabPanes,
  primaryPane,
  reorderTab as reorderTabInPanes,
  secondaryPane,
  tabIdAtIndex,
  togglePinTab as togglePinTabInPanes,
} from "../store/panes";
import { activateNote } from "./workspace";

export function openNoteInTab(store: RendererStore, noteId: string): void {
  if (store.getState().nodes.get(noteId)?.kind !== "note") {
    return;
  }
  store.update((current) => ({
    ...current,
    panes: openNoteInTabPanes(current.panes, noteId),
  }));
  activateNote(store, noteId);
}

export function activateTab(store: RendererStore, noteId: string): void {
  activateNote(store, noteId);
}

export function closeActiveTab(store: RendererStore): void {
  const state = store.getState();
  if (state.focusedPaneId === SECONDARY_PANE_ID && secondaryPane(state.panes)) {
    closeSplit(store);
    return;
  }
  const activeNoteId = primaryPane(state.panes).activeNoteId;
  if (activeNoteId !== null) {
    closeTab(store, activeNoteId);
  }
}

export function closeTab(store: RendererStore, noteId: string): void {
  const result = closeTabInPanes(store.getState().panes, noteId);
  store.update((current) => ({ ...current, panes: result.panes }));
  if (result.nextActiveNoteId !== undefined) {
    activateNote(store, result.nextActiveNoteId);
  }
}

export function closeOtherTabs(store: RendererStore, noteId: string): void {
  const result = closeOtherTabsInPanes(store.getState().panes, noteId);
  store.update((current) => ({ ...current, panes: result.panes }));
  if (result.nextActiveNoteId !== undefined) {
    activateNote(store, result.nextActiveNoteId);
  }
}

export function closeTabsToSide(
  store: RendererStore,
  noteId: string,
  side: "left" | "right",
): void {
  const result = closeTabsToSideInPanes(store.getState().panes, noteId, side);
  store.update((current) => ({ ...current, panes: result.panes }));
  if (result.nextActiveNoteId !== undefined) {
    activateNote(store, result.nextActiveNoteId);
  }
}

export function closeAllTabs(store: RendererStore): void {
  const result = closeAllTabsInPanes(store.getState().panes);
  store.update((current) => ({ ...current, panes: result.panes }));
  if (result.nextActiveNoteId !== undefined) {
    activateNote(store, result.nextActiveNoteId);
  }
}

export function togglePinTab(store: RendererStore, noteId: string): void {
  store.update((current) => ({
    ...current,
    panes: togglePinTabInPanes(current.panes, noteId),
  }));
}

export function reorderTab(
  store: RendererStore,
  noteId: string,
  beforeNoteId: string | null,
): void {
  store.update((current) => ({
    ...current,
    panes: reorderTabInPanes(current.panes, noteId, beforeNoteId),
  }));
}

/**
 * Activates the tab at a 1-based position in the focused pane's strip, or the
 * last tab for index 0. Silently does nothing when the tabbed workspace is off
 * or the slot is out of range.
 */
export function activateTabAtIndex(store: RendererStore, index: number): void {
  const state = store.getState();
  if (!opensNotesInTabs(state.settings)) {
    return;
  }
  const noteId = tabIdAtIndex(state.panes, state.focusedPaneId, index);
  if (noteId === null) {
    return;
  }
  if (state.focusedPaneId === SECONDARY_PANE_ID && secondaryPane(state.panes) !== null) {
    store.update((current) => ({
      ...current,
      panes: activateTabInPane(current.panes, SECONDARY_PANE_ID, noteId),
    }));
    return;
  }
  activateNote(store, noteId);
}

export function cycleTab(store: RendererStore, direction: -1 | 1): void {
  const nextId = cycleTabId(store.getState().panes, direction);
  if (nextId !== null) {
    activateNote(store, nextId);
  }
}

export function openBeside(store: RendererStore, noteId?: string): void {
  const state = store.getState();
  const targetId = noteId ?? state.activeNoteId;
  if (targetId === null || state.nodes.get(targetId)?.kind !== "note") {
    return;
  }
  store.update((current) => ({
    ...current,
    panes: openBesidePanes(current.panes, targetId),
  }));
}

export function closeSplit(store: RendererStore): void {
  store.update((current) =>
    current.panes.length > 1
      ? {
          ...current,
          panes: closeSplitPanes(current.panes),
          focusedPaneId: PRIMARY_PANE_ID,
        }
      : current,
  );
}

export function focusPane(store: RendererStore, paneId: string): void {
  store.update((current) =>
    current.focusedPaneId === paneId ||
    !current.panes.some((pane) => pane.paneId === paneId)
      ? current
      : { ...current, focusedPaneId: paneId },
  );
}
