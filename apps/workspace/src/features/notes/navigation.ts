import { opensNotesInTabs } from "@skriuw/renderer-core/settings/open-notes-in-tabs";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";

export function activateNote(store: RendererStore, id: string | null): void {
  store.setActiveNote(id);
}

/**
 * The sequence `previousNote`/`nextNote` walk: the focused pane's tab strip
 * when notes open in tabs (and more than one tab is open), the sidebar's
 * note order otherwise.
 */
export function noteNavigationOrder(state: RendererState): readonly string[] {
  if (opensNotesInTabs(state.settings)) {
    const pane =
      state.panes.find((entry) => entry.paneId === state.focusedPaneId) ?? state.panes[0];
    if (pane && pane.openNoteIds.length > 1) {
      return pane.openNoteIds;
    }
  }
  return state.noteIds;
}

export function navigateNote(store: RendererStore, direction: -1 | 1): void {
  const state = store.getState();
  if (state.activeNoteId === null) {
    return;
  }
  const order = noteNavigationOrder(state);
  const index = order.indexOf(state.activeNoteId);
  if (index < 0 || order.length < 2) {
    return;
  }
  const nextId = order[(index + direction + order.length) % order.length];
  if (nextId !== undefined) {
    activateNote(store, nextId);
  }
}

/**
 * The note a whole-note action targets: the focused pane's note in a split,
 * falling back to the workspace's active note. Null when no note is open.
 */
export function focusedPaneNoteId(state: RendererState): string | null {
  const pane = state.panes.find((entry) => entry.paneId === state.focusedPaneId);
  const noteId = pane?.activeNoteId ?? state.activeNoteId;
  return noteId !== null && state.nodes.get(noteId)?.kind === "note" ? noteId : null;
}

/**
 * The note that takes over when `noteId` leaves the workspace: its successor in
 * the navigation order, or its predecessor when it was last. Null when nothing
 * remains, which leaves the workspace on its empty state.
 */
export function nextNoteAfterRemoval(state: RendererState, noteId: string): string | null {
  const order = noteNavigationOrder(state);
  const index = order.indexOf(noteId);
  if (index < 0) {
    return null;
  }
  return order[index + 1] ?? order[index - 1] ?? null;
}
