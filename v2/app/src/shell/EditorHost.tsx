import { useRendererSelector } from "../store/useRendererSelector";
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

export function EditorHost({ store }: Props) {
  const document = useRendererSelector(store, (state) =>
    state.activeNoteId === null ? null : (state.documents.get(state.activeNoteId) ?? null),
  );
  if (!document) {
    return <div className="editor-empty">Select a note</div>;
  }
  return (
    <div className="editor-host" data-note-id={document.noteId}>
      <pre className="editor-placeholder-markdown">{document.markdown}</pre>
    </div>
  );
}
