import { NoteEditor } from "@/features/editor/note-editor";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

type Props = {
  store: RendererStore;
};

export function StandaloneEditor({ store }: Props) {
  return (
    <div className="editor-pane h-full min-h-0 min-w-0">
      <div className="editor-scroll h-full min-w-0 overflow-y-auto bg-theme-editor">
        <div className="mx-auto w-[calc(100%_-_2.5rem)] max-w-[72ch] pt-6">
          <NoteEditor store={store} />
        </div>
      </div>
    </div>
  );
}
