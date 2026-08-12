import type { RendererState, RendererStore } from "@/store/types";
import { useRendererSelector } from "@/store/use-renderer-selector";

export type NoteNavigation = {
  noteId: string | null;
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
  activeNoteId: string | null,
];

function selectNavigation(state: RendererState): NavigationSnapshot {
  const activeNoteId = state.activeNoteId;
  if (activeNoteId === null) {
    return ["", null, null, null];
  }
  const title = state.metadata.get(activeNoteId)?.title ?? "";
  const index = state.noteIds.indexOf(activeNoteId);
  if (index < 0) {
    return [title, null, null, activeNoteId];
  }
  return [
    title,
    state.noteIds[index - 1] ?? null,
    state.noteIds[index + 1] ?? null,
    activeNoteId,
  ];
}

function sameNavigation(left: NavigationSnapshot, right: NavigationSnapshot): boolean {
  return (
    left[0] === right[0] &&
    left[1] === right[1] &&
    left[2] === right[2] &&
    left[3] === right[3]
  );
}

export function useNoteNavigation(store: RendererStore): NoteNavigation {
  const [title, previousNoteId, nextNoteId, activeNoteId] = useRendererSelector(
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
    noteId: activeNoteId,
    title,
    canNavigatePrev: previousNoteId !== null,
    canNavigateNext: nextNoteId !== null,
    navigatePrev,
    navigateNext,
  };
}
