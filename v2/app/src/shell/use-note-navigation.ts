import { useMemo } from "react";
import type { RendererStore } from "../store/types";
import { useRendererSelector } from "../store/use-renderer-selector";

export type NoteNavigation = {
  title: string;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  navigatePrev: () => void;
  navigateNext: () => void;
};

export function useNoteNavigation(store: RendererStore): NoteNavigation {
  const activeNoteId = useRendererSelector(store, (state) => state.activeNoteId);
  const nodeOrder = useRendererSelector(store, (state) => state.nodeOrder);
  const nodes = useRendererSelector(store, (state) => state.nodes);
  const title = activeNoteId === null ? "" : (nodes.get(activeNoteId)?.title ?? "");

  const noteIds = useMemo(
    () => nodeOrder.filter((id) => nodes.get(id)?.kind === "note"),
    [nodeOrder, nodes],
  );

  const currentIndex = activeNoteId === null ? -1 : noteIds.indexOf(activeNoteId);
  const canNavigatePrev = currentIndex > 0;
  const canNavigateNext = currentIndex >= 0 && currentIndex < noteIds.length - 1;

  function navigatePrev(): void {
    const id = noteIds[currentIndex - 1];
    if (canNavigatePrev && id) store.setActiveNote(id);
  }

  function navigateNext(): void {
    const id = noteIds[currentIndex + 1];
    if (canNavigateNext && id) store.setActiveNote(id);
  }

  return { title, canNavigatePrev, canNavigateNext, navigatePrev, navigateNext };
}
