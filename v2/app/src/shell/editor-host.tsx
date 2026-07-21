import { NoteEditor } from "../editor/note-editor";
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

export function EditorHost({ store }: Props) {
  return <NoteEditor store={store} />;
}
