import { useMemo } from "react";
import { appRouteHash, useRouteFocus } from "../app-route";
import { activateNote } from "../actions/workspace";
import { ChevronLeftIcon, HistoryIcon } from "../shared/icons";
import { formatRelativeTime } from "../shared/lib/relative-time";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";
import { VersionHistoryPanel } from "./version-history-panel";
import { projectVersionList } from "./version-model";

type Props = {
  store: RendererStore;
};

function selectHistoryHeaders(state: RendererState) {
  return state.historyHeaders;
}

function selectSourceNodes(state: RendererState) {
  return state.sourceNodes;
}

export function HistoryView({ store }: Props) {
  const noteId = useRouteFocus();
  const historyHeaders = useRendererSelector(store, selectHistoryHeaders);
  const sourceNodes = useRendererSelector(store, selectSourceNodes);
  const headers = noteId === null ? null : (historyHeaders.get(noteId) ?? null);
  const versions = useMemo(() => projectVersionList(headers), [headers]);
  const title = noteId === null ? null : (sourceNodes.get(noteId)?.title ?? "Untitled");
  const latest = versions[0];

  function backToNote(): void {
    if (noteId !== null) {
      activateNote(store, noteId);
    }
    window.location.hash = appRouteHash("notes");
  }

  return (
    <main
      className="col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
      aria-labelledby="history-title"
    >
      <header className="flex min-h-[76px] items-start justify-between gap-6 border-b border-theme-divider py-3.5 pl-[22px] pr-[calc(var(--window-controls-width,112px)+8px)]">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={backToNote}
            className="mt-0.5 flex cursor-pointer items-center gap-1 rounded-[var(--radius)] border border-border bg-transparent px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeftIcon size={14} />
            Back to note
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HistoryIcon size={15} className="shrink-0 text-theme-secondary" />
              <h1
                id="history-title"
                className="truncate text-base font-[650] tracking-[-0.015em] text-foreground"
              >
                {title ?? "Version history"}
              </h1>
              {versions.length > 0 && (
                <span className="min-w-[19px] rounded-lg border border-border px-1.5 py-0.5 text-center font-mono text-[10px] leading-[1.3] text-theme-secondary">
                  {versions.length}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-[1.45] text-theme-secondary">
              {latest
                ? `Latest revision ${formatRelativeTime(latest.createdAt)}.`
                : "No revisions captured for this note yet."}
            </p>
          </div>
        </div>
      </header>

      {noteId !== null && versions.length > 0 ? (
        <VersionHistoryPanel key={noteId} store={store} noteId={noteId} versions={versions} />
      ) : (
        <div className="grid place-items-center px-6">
          <p className="m-0 max-w-[46ch] text-center text-[13px] text-muted-foreground">
            Revisions appear here as you edit. Keep writing and Skriuw will snapshot the note as it
            changes.
          </p>
        </div>
      )}
    </main>
  );
}
