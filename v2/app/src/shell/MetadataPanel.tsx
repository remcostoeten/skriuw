import { useRendererSelector } from "../store/useRendererSelector";
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

export function MetadataPanel({ store }: Props) {
  const metadata = useRendererSelector(store, (state) =>
    state.activeNoteId === null ? null : (state.metadata.get(state.activeNoteId) ?? null),
  );
  if (!metadata) {
    return <aside className="metadata-panel" aria-label="Note metadata" />;
  }
  return (
    <aside className="metadata-panel" aria-label="Note metadata">
      <h2 className="metadata-title">{metadata.title}</h2>
      <dl className="metadata-fields">
        <dt>Words</dt>
        <dd>{metadata.wordCount}</dd>
        <dt>Updated</dt>
        <dd>{new Date(metadata.updatedAt).toLocaleString()}</dd>
      </dl>
    </aside>
  );
}
