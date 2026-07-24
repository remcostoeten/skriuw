import { recordRender } from "./ledger";
import { useRendererSelector } from "./useRendererSelector";
import type { RendererStore } from "./types";

type Props = {
  store: RendererStore;
};

const selectWordCount = (state: ReturnType<RendererStore["getState"]>) =>
  state.activeNoteId ? state.metadata.get(state.activeNoteId)?.wordCount ?? 0 : 0;

export function MetadataWordCount({ store }: Props) {
  recordRender("MetadataWordCount");
  const wordCount = useRendererSelector(store, selectWordCount);
  return <dd>{wordCount}</dd>;
}
