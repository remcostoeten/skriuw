import { useMemo, useRef } from "react";
import { editorModeForNote } from "@/store/actions/editor-mode";
import { NoteEditor } from "@/features/editor/note-editor";
import { RawMarkdownEditor } from "@/features/editor/raw-markdown-editor";
import { NotePropertiesShelf } from "@/features/properties/note-properties-shelf";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { WaypointsIcon } from "@/shared/icons/static";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { NoteCover } from "@/features/note-chrome/note-cover";
import { UnlockPane } from "@/features/lock/unlock-pane";
import { isNoteSealed } from "@/features/lock/lock-model";
import { InsertMediaAccessory } from "@/features/editor/insert-media-accessory";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { COMPACT_SHELL_QUERY } from "./shell-layout";

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
  const selectSealed = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      return selected !== null && isNoteSealed(state, selected);
    },
    [selectNoteId],
  );
  const isSealed = useRendererSelector(store, selectSealed);
  const selectEditableNoteId = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      return selected !== null && isNoteSealed(state, selected) ? null : selected;
    },
    [selectNoteId],
  );
  const selectHasCover = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      if (selected === null) {
        return false;
      }
      const node = state.sourceNodes.get(selected);
      return node?.coverImageId != null || node?.coverGradient != null;
    },
    [selectNoteId],
  );
  const hasCover = useRendererSelector(store, selectHasCover);
  const isRawMode = useRendererSelector(store, selectRawMode);
  const compact = useMediaQuery(COMPACT_SHELL_QUERY);
  const hostRef = useRef<HTMLDivElement>(null);
  const hasActiveNote = noteId !== null;
  const showsEditor = hasActiveNote && !isSealed;
  return (
    <div ref={hostRef} className="editor-scroll h-full min-w-0 overflow-y-auto bg-theme-editor">
      <div className={showsEditor ? "relative w-full" : "hidden"}>
        {showsEditor && <NoteCover store={store} selectNoteId={selectEditableNoteId} />}
        <div className={`mx-auto w-[calc(100%_-_6rem)] max-w-[72ch]${hasCover ? "" : " pt-8"}`}>
          {showsEditor && (
            <NotePropertiesShelf key={noteId} store={store} selectNoteId={selectEditableNoteId} />
          )}
          {isRawMode ? (
            <RawMarkdownEditor store={store} selectNoteId={selectEditableNoteId} />
          ) : (
            <NoteEditor store={store} selectNoteId={selectEditableNoteId} />
          )}
        </div>
      </div>
      {compact && showsEditor && !isRawMode && <InsertMediaAccessory hostRef={hostRef} />}
      {hasActiveNote && isSealed && <UnlockPane store={store} noteId={noteId} />}
      {!hasActiveNote && (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <WaypointsIcon size={40} className="text-muted-foreground" />
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">No note selected</p>
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
