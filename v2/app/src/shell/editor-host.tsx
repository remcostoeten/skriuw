import { useMemo } from "react";
import { editorModeForNote } from "@/actions/editor-mode";
import { NoteEditor } from "@/editor/note-editor";
import { RawMarkdownEditor } from "@/editor/raw-markdown-editor";
import { NotePropertiesShelf } from "@/properties/note-properties-shelf";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { WaypointsIcon, iconStrokeWidth } from "@/shared/icons";
import type { RendererState, RendererStore } from "@/store/types";
import { NoteCover } from "./note-cover";

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
  const selectRawMode = useMemo(
    () => (state: RendererState) => {
      const noteId = selectNoteId(state);
      if (noteId === null) {
        return false;
      }
      return (
        editorModeForNote(state, noteId) === "raw" ||
        state.documents.get(noteId)?.hasLosslessMarkdown === true
      );
    },
    [selectNoteId],
  );
  const noteId = useRendererSelector(store, selectNoteId);
  const selectHasCover = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      return selected !== null && state.sourceNodes.get(selected)?.coverImageId != null;
    },
    [selectNoteId],
  );
  const hasCover = useRendererSelector(store, selectHasCover);
  const isRawMode = useRendererSelector(store, selectRawMode);
  const hasActiveNote = noteId !== null;
  return (
    <div className="editor-scroll h-full min-w-0 overflow-y-auto bg-theme-editor">
      <div className={hasActiveNote ? "relative w-full" : "hidden"}>
        {noteId !== null && <NoteCover store={store} selectNoteId={selectNoteId} />}
        <div
          className={`mx-auto w-[calc(100%_-_6rem)] max-w-[72ch]${hasCover ? "" : " pt-8"}`}
        >
          {noteId !== null && (
            <NotePropertiesShelf key={noteId} store={store} selectNoteId={selectNoteId} />
          )}
          {isRawMode ? (
            <RawMarkdownEditor store={store} selectNoteId={selectNoteId} />
          ) : (
            <NoteEditor store={store} selectNoteId={selectNoteId} />
          )}
        </div>
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
