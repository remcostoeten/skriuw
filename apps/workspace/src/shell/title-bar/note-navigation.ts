import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";

export type NoteNavigation = {
  noteId: string | null;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  navigatePrev: () => void;
  navigateNext: () => void;
};

export type NoteNavigationSnapshot = readonly [
  previousNoteId: string | null,
  nextNoteId: string | null,
  activeNoteId: string | null,
];

/**
 * @name selectNoteNavigation
 * @description Reads the active note id and its previous and next neighbours in
 * note order. Leaves out the title, so renaming the active note keeps the
 * snapshot equal under `sameNoteNavigation`.
 *
 * @example
 * const [previousNoteId, nextNoteId, activeNoteId] = selectNoteNavigation(store.getState());
 */
export function selectNoteNavigation(state: RendererState): NoteNavigationSnapshot {
  const activeNoteId = state.activeNoteId;
  if (activeNoteId === null) {
    return [null, null, null];
  }
  const index = state.noteIds.indexOf(activeNoteId);
  if (index < 0) {
    return [null, null, activeNoteId];
  }
  return [state.noteIds[index - 1] ?? null, state.noteIds[index + 1] ?? null, activeNoteId];
}

/**
 * @name sameNoteNavigation
 * @description Compares two navigation snapshots element by element, so a
 * subscriber only re-renders when a neighbour or the active note changes.
 *
 * @example
 * useRendererSelector(store, selectNoteNavigation, sameNoteNavigation);
 */
export function sameNoteNavigation(
  left: NoteNavigationSnapshot,
  right: NoteNavigationSnapshot,
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

export function useNoteNavigation(store: RendererStore): NoteNavigation {
  const [previousNoteId, nextNoteId, activeNoteId] = useRendererSelector(
    store,
    selectNoteNavigation,
    sameNoteNavigation,
  );

  function navigatePrev(): void {
    if (previousNoteId) store.setActiveNote(previousNoteId);
  }

  function navigateNext(): void {
    if (nextNoteId) store.setActiveNote(nextNoteId);
  }

  return {
    noteId: activeNoteId,
    canNavigatePrev: previousNoteId !== null,
    canNavigateNext: nextNoteId !== null,
    navigatePrev,
    navigateNext,
  };
}
