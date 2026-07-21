import { NoteEditor } from "../editor/note-editor";
import { useRendererSelector } from "../store/use-renderer-selector";
import { WaypointsIcon } from "../shared/icons";
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

export function EditorHost({ store }: Props) {
  const hasActiveNote = useRendererSelector(store, (state) => state.activeNoteId !== null);
  return (
    <div className="h-full min-w-0 overflow-y-auto bg-theme-editor px-12 py-8">
      <div className={hasActiveNote ? "mx-auto w-full max-w-[72ch]" : "hidden"}>
        <NoteEditor store={store} />
      </div>
      {!hasActiveNote && (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <WaypointsIcon size={40} strokeWidth={1.4} className="text-muted-foreground" />
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">No note selected</p>
            <p className="text-sm text-muted-foreground">
              Select a note from the sidebar or create a new one to start writing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
