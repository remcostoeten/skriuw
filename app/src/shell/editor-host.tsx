import { useMemo } from "react";
import { editorModeForNote } from "@/store/actions/editor-mode";
import { NoteEditor } from "@/features/editor/note-editor";
import { RawMarkdownEditor } from "@/features/editor/raw-markdown-editor";
import { NotePropertiesShelf } from "@/features/properties/note-properties-shelf";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { WaypointsIcon, iconStrokeWidth } from "@/shared/icons/static";
import type { RendererState, RendererStore } from "@/store/types";
import { NoteCover } from "@/features/note-chrome/note-cover";
import { DrawingOverlay } from "@/features/drawing/drawing-overlay";
import { closeAnnotateMode } from "@/store/actions/annotate-mode";

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
  const selectAnnotating = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      return selected !== null && state.annotatingNoteId === selected;
    },
    [selectNoteId],
  );
  const annotating = useRendererSelector(store, selectAnnotating);
  const isRawMode = useRendererSelector(store, selectRawMode);
  const hasActiveNote = noteId !== null;
  return (
    <div className="relative h-full min-w-0">
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
      {noteId !== null && !isRawMode && (
        <DrawingOverlay
          key={noteId}
          store={store}
          noteId={noteId}
          active={annotating}
          onDone={() => closeAnnotateMode(store)}
        />
      )}
    </div>
  );
}
