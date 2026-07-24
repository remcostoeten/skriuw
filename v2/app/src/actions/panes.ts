import type { RendererStore } from "../store/types";
import {
  PRIMARY_PANE_ID,
  SECONDARY_PANE_ID,
  closeSplit as closeSplitPanes,
  closeTab as closeTabInPanes,
  cycleTabId,
  openBeside as openBesidePanes,
  openNoteInTab as openNoteInTabPanes,
  primaryPane,
  secondaryPane,
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
