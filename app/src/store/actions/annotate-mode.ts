import type { RendererStore } from "@/store/types";

/**
 * Annotate mode is session-only interaction state, not a document edit: it
 * decides whether the annotation overlay takes pointer events, and nothing
 * about it is persisted. The ink it produces commits through the ordinary
 * document save path — see ADR-0035.
 */
export function openAnnotateMode(store: RendererStore, noteId: string): void {
  store.update((current) =>
    current.annotatingNoteId === noteId ? current : { ...current, annotatingNoteId: noteId },
  );
}

export function closeAnnotateMode(store: RendererStore): void {
  store.update((current) =>
    current.annotatingNoteId === null ? current : { ...current, annotatingNoteId: null },
  );
}

export function toggleAnnotateMode(store: RendererStore): void {
  const { activeNoteId, annotatingNoteId } = store.getState();
  if (annotatingNoteId !== null) {
    closeAnnotateMode(store);
    return;
  }
  if (activeNoteId !== null) {
    openAnnotateMode(store, activeNoteId);
  }
}
