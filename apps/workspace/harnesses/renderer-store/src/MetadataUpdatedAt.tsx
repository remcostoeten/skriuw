import { recordRender } from "./ledger";
import { useRendererSelector } from "./useRendererSelector";
import type { RendererStore } from "./types";

type Props = {
  store: RendererStore;
};

function selectUpdatedAt(state: ReturnType<RendererStore["getState"]>) {
  return state.activeNoteId ? state.metadata.get(state.activeNoteId)?.updatedAt ?? "—" : "—";
}

export function MetadataUpdatedAt({ store }: Props) {
  recordRender("MetadataUpdatedAt");
  const updatedAt = useRendererSelector(store, selectUpdatedAt);
  return <dd>{updatedAt}</dd>;
}
