import { projectSettings } from "@/settings/settings-model";
import type { RendererState, RendererStore } from "@/store/types";

export type EditorMode = "rendered" | "raw";

export function editorModeForNote(state: RendererState, noteId: string): EditorMode {
  return (
    state.editorModeByNoteId.get(noteId) ??
    (projectSettings(state.settings).editorDefaultRawMode ? "raw" : "rendered")
  );
}

export function setEditorMode(store: RendererStore, noteId: string, mode: EditorMode): void {
  store.update((current) => {
    if (editorModeForNote(current, noteId) === mode) {
      return current;
    }
    return {
      ...current,
      editorModeByNoteId: new Map(current.editorModeByNoteId).set(noteId, mode),
    };
  });
}

export function toggleEditorMode(store: RendererStore, noteId: string): void {
  const next: EditorMode = editorModeForNote(store.getState(), noteId) === "raw" ? "rendered" : "raw";
  setEditorMode(store, noteId, next);
}
