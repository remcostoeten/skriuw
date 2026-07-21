import { NoteEditor } from "../editor/NoteEditor";
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

export function EditorHost({ store }: Props) {
  return <NoteEditor store={store} />;
}
