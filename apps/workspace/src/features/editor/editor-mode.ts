import { projectSettings } from "@/features/settings/settings-model";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";

export type EditorMode = "rendered" | "raw";

export function editorModeForNote(state: RendererState, noteId: string): EditorMode {
  return (
    state.editorModeByNoteId.get(noteId) ??
    (projectSettings(state.settings).editorDefaultRawMode ? "raw" : "rendered")
  );
}

/**
 * @name rendersRawEditor
 * @description Whether the note is shown in the raw Markdown editor instead of
 * the rich ProseMirror editor, either by its editor mode or because its
 * document only round-trips losslessly as Markdown.
 *
 * @example
 * const isRaw = rendersRawEditor(store.getState(), noteId);
 */
export function rendersRawEditor(state: RendererState, noteId: string): boolean {
  return (
    editorModeForNote(state, noteId) === "raw" ||
    state.documents.get(noteId)?.hasLosslessMarkdown === true
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
  const next: EditorMode =
    editorModeForNote(store.getState(), noteId) === "raw" ? "rendered" : "raw";
  setEditorMode(store, noteId, next);
}
