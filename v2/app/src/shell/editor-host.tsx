import { useMemo } from "react";
import { editorModeForNote } from "../actions/editor-mode";
import { NoteEditor } from "../editor/note-editor";
import { RawMarkdownEditor } from "../editor/raw-markdown-editor";
import { useRendererSelector } from "../store/use-renderer-selector";
import { WaypointsIcon, iconStrokeWidth } from "../shared/icons";
import type { RendererState, RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
  selectNoteId?: (state: RendererState) => string | null;
  emptyMessage?: string;
};

function selectStoreActiveNote(state: RendererState): string | null {
  return state.activeNoteId;
}

export function EditorHost({
  store,
  selectNoteId = selectStoreActiveNote,
  emptyMessage = "Select a note from the sidebar or create a new one to start writing.",
}: Props) {
  const selectHasNote = useMemo(
    () => (state: RendererState) => selectNoteId(state) !== null,
    [selectNoteId],
  );
  const selectRawMode = useMemo(
    () => (state: RendererState) => {
      const noteId = selectNoteId(state);
      return noteId !== null && editorModeForNote(state, noteId) === "raw";
    },
    [selectNoteId],
  );
  const hasActiveNote = useRendererSelector(store, selectHasNote);
  const isRawMode = useRendererSelector(store, selectRawMode);
  return (
    <div className="editor-scroll h-full min-w-0 overflow-y-auto bg-theme-editor px-12 py-8">
      <div className={hasActiveNote ? "mx-auto w-full max-w-[72ch]" : "hidden"}>
        {isRawMode ? (
          <RawMarkdownEditor store={store} selectNoteId={selectNoteId} />
        ) : (
          <NoteEditor store={store} selectNoteId={selectNoteId} />
        )}
      </div>
      {!hasActiveNote && (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <WaypointsIcon size={40} strokeWidth={iconStrokeWidth(40, 1.25)} className="text-muted-foreground" />
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">No note selected</p>
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
