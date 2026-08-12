import { recordRender } from "./ledger";
import { useRendererSelector } from "./useRendererSelector";
import type { RendererStore } from "./types";

type Props = {
  store: RendererStore;
};

const selectTitle = (state: ReturnType<RendererStore["getState"]>) =>
  state.activeNoteId ? state.metadata.get(state.activeNoteId)?.title ?? "Untitled" : "No note";

export function MetadataTitle({ store }: Props) {
  recordRender("MetadataTitle");
  const title = useRendererSelector(store, selectTitle);
  return <dd data-metadata-title>{title}</dd>;
}
