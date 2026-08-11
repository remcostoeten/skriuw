import { useMemo } from "react";
import { appRouteHash, useRouteFocus, useRouteHistoryVersion } from "../app-route";
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
  const requestedVersionId = useRouteHistoryVersion();
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
      <header className="flex h-[52px] items-center gap-2.5 border-b border-theme-divider pl-3 pr-[calc(var(--window-controls-width,112px)+8px)]">
        <button
          type="button"
          onClick={backToNote}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius)] border-none bg-transparent pl-1 pr-2 text-[12px] font-[560] text-theme-secondary transition-colors hover:bg-theme-hover hover:text-foreground"
        >
          <ChevronLeftIcon size={15} />
          Back to note
        </button>
        <span aria-hidden className="h-4 w-px shrink-0 bg-theme-divider" />
        <HistoryIcon size={14} className="shrink-0 text-theme-secondary" />
        <h1
          id="history-title"
          className="min-w-0 truncate text-[13px] font-[650] tracking-[-0.01em] text-foreground"
        >
          {title ?? "Version history"}
        </h1>
        {versions.length > 0 && (
          <span className="shrink-0 rounded-full bg-theme-hover px-1.5 py-px font-mono text-[10px] leading-[1.5] tabular-nums text-theme-secondary">
            {versions.length}
          </span>
        )}
        <p className="ml-auto hidden shrink-0 pl-4 text-[11px] text-theme-secondary sm:block">
          {latest ? `Latest revision ${formatRelativeTime(latest.createdAt)}` : "No revisions yet"}
        </p>
      </header>

      {noteId !== null && versions.length > 0 ? (
        <VersionHistoryPanel
          key={noteId}
          store={store}
          noteId={noteId}
          versions={versions}
          requestedVersionId={requestedVersionId}
        />
      ) : (
        <div className="grid place-items-center px-6">
          <div className="flex max-w-[42ch] flex-col items-center text-center">
            <span className="mb-3 grid size-10 place-items-center rounded-full bg-theme-hover text-theme-secondary">
              <HistoryIcon size={18} />
            </span>
            <p className="m-0 text-[13px] font-[600] text-foreground">No revisions yet</p>
            <p className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">
              Keep writing and Skriuw snapshots this note as it changes. Revisions show up here the
              moment one is captured.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
