import type { RendererState, RendererStore } from "../store/types";
import { useRendererSelector } from "../store/use-renderer-selector";

export type NoteNavigation = {
  title: string;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  navigatePrev: () => void;
  navigateNext: () => void;
};

type NavigationSnapshot = readonly [
  title: string,
  previousNoteId: string | null,
  nextNoteId: string | null,
];

function selectNavigation(state: RendererState): NavigationSnapshot {
  const activeNoteId = state.activeNoteId;
  if (activeNoteId === null) {
    return ["", null, null];
  }
  const title = state.metadata.get(activeNoteId)?.title ?? "";
  const index = state.noteIds.indexOf(activeNoteId);
  if (index < 0) {
    return [title, null, null];
  }
  return [title, state.noteIds[index - 1] ?? null, state.noteIds[index + 1] ?? null];
}

function sameNavigation(left: NavigationSnapshot, right: NavigationSnapshot): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

export function useNoteNavigation(store: RendererStore): NoteNavigation {
  const [title, previousNoteId, nextNoteId] = useRendererSelector(
    store,
    selectNavigation,
    sameNavigation,
  );

  function navigatePrev(): void {
    if (previousNoteId) store.setActiveNote(previousNoteId);
  }

  function navigateNext(): void {
    if (nextNoteId) store.setActiveNote(nextNoteId);
  }

  return {
    title,
    canNavigatePrev: previousNoteId !== null,
    canNavigateNext: nextNoteId !== null,
    navigatePrev,
    navigateNext,
  };
}
