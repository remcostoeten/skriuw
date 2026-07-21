import { useRendererSelector } from "../store/use-renderer-selector";
import { HistoryIcon, InfoIcon } from "../shared/icons";
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

export function MetadataPanel({ store }: Props) {
  const metadata = useRendererSelector(store, (state) =>
    state.activeNoteId === null ? null : (state.metadata.get(state.activeNoteId) ?? null),
  );
  const versions = useRendererSelector(store, (state) =>
    state.activeNoteId === null ? null : (state.historyHeaders.get(state.activeNoteId) ?? null),
  );
  if (!metadata) {
    return <aside className="metadata-panel" aria-label="Note metadata" />;
  }
  return (
    <aside className="metadata-panel" aria-label="Note metadata">
      <h2 className="metadata-title">{metadata.title}</h2>
      <section className="metadata-section">
        <h3 className="metadata-section-header">
          <InfoIcon size={14} />
          Details
        </h3>
        <dl className="metadata-fields">
          <dt>Words</dt>
          <dd>{metadata.wordCount}</dd>
          <dt>Updated</dt>
          <dd>{new Date(metadata.updatedAt).toLocaleString()}</dd>
        </dl>
      </section>
      {versions && versions.length > 0 && (
        <section className="metadata-section metadata-versions">
          <h3 className="metadata-section-header">
            <HistoryIcon size={14} />
            Versions
            <span className="metadata-section-count">{versions.length}</span>
          </h3>
          <ul>
            {versions.map((version) => (
              <li key={version.versionId}>
                <span className="version-summary">{version.summary}</span>
                <span className="version-date">
                  {new Date(version.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
