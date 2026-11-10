import { useMemo } from "react";
import "./history.css";
import { useRouteFocus, useRouteHistoryVersion } from "@/shared/routing/app-route";
import { appRouteHash } from "@skriuw/renderer-core/route/app-route";
import { activateNote } from "@/features/notes/navigation";
import { EMPTY_STATE_COLORS } from "@/shared/empty-state/app-theme";
import { EmptyState } from "@/shared/empty-state/empty-state";
import { ActivityIllustration } from "@/shared/empty-state/illustrations";
import { ChevronLeftIcon } from "@/shared/icons/static";
import { formatRelativeTime } from "@/shared/format/relative-time";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { WindowControlsSlot } from "@/shared/ui/window-controls-slot";
import { settingsPress, settingsTransition } from "@/shared/ui/settings-controls";
import { cn } from "@/shared/styling/class-names";
import { VersionHistoryPanel } from "./version-history-panel";
import { projectVersionList } from "./versions/model";

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
      className="history-page col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
      aria-labelledby="history-title"
    >
      <header
        data-tauri-drag-region
        className="relative flex h-[52px] items-center gap-3 border-b border-theme-divider pl-3"
      >
        <button
          type="button"
          onClick={backToNote}
          aria-keyshortcuts="Escape"
          className={cn(
            "flex h-[30px] shrink-0 cursor-pointer items-center gap-1 rounded-[7px] border-0 bg-transparent pr-2.5 pl-1.5 text-[12.5px] text-theme-secondary hover:bg-theme-hover hover:text-foreground",
            settingsTransition,
            settingsPress,
          )}
        >
          <ChevronLeftIcon size={15} />
          Back to note
        </button>
        <span aria-hidden className="h-4 w-px shrink-0 bg-theme-divider" />
        <h1
          id="history-title"
          className="m-0 flex min-w-0 items-baseline gap-2 text-[15px] font-medium tracking-[-0.01em] text-foreground"
        >
          <span className="truncate">{title ?? "Version history"}</span>
          {title !== null && (
            <span className="shrink-0 text-[12.5px] font-normal tracking-normal text-theme-secondary">
              History
            </span>
          )}
        </h1>
        <p className="m-0 min-w-0 flex-1 truncate text-[12.5px] tabular-nums text-theme-dim max-[720px]:hidden">
          {latest
            ? `${versions.length} ${versions.length === 1 ? "revision" : "revisions"}, latest ${formatRelativeTime(latest.createdAt)}`
            : "No revisions yet"}
        </p>
        <WindowControlsSlot className="ml-auto" />
      </header>

      {noteId !== null && versions.length > 0 ? (
        <VersionHistoryPanel
          key={noteId}
          store={store}
          noteId={noteId}
          versions={versions}
          requestedVersionId={requestedVersionId}
          onBack={backToNote}
        />
      ) : (
        <div className="grid place-items-center px-6">
          <EmptyState
            colors={EMPTY_STATE_COLORS}
            illustration={<ActivityIllustration />}
            title="No revisions yet"
            description="Skriuw captures a revision after each pause in typing. Keep writing and the first one shows up here, ready to compare or restore."
          />
        </div>
      )}
    </main>
  );
}
