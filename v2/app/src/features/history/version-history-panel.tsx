import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DOMSerializer } from "prosemirror-model";
import { restoreNoteVersion } from "@/store/actions/workspace";
import type { HistoryVersionContent } from "@/bridge/commands";
import { readHistoryVersion } from "@/bridge/commands";
import { productSchema } from "@/features/editor/schema";
import { CloseIcon, HistoryIcon, RotateCcwIcon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { HistoryGraphRail } from "./history-graph-rail";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import type { RendererState, RendererStore } from "@/store/types";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { VersionDiffView, useMarkdownDiff } from "./version-diff-view";
import { groupVersionRows, parseHistoryMarkdown, type VersionListItem } from "./version-model";

type Props = {
  store: RendererStore;
  noteId: string;
  versions: readonly VersionListItem[];
  requestedVersionId?: string | null;
};

type PreviewMode = "diff" | "full";

type PreviewState =
  | { status: "loading"; versionId: string }
  | { status: "error"; versionId: string; message: string }
  | { status: "ready"; versionId: string; content: HistoryVersionContent; restoring: boolean };

const VERSION_ROW_HEIGHT = 52;
const GROUP_ROW_HEIGHT = 30;

const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const fullFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatClock(value: number): string {
  return timeFormatter.format(new Date(value));
}

function formatTimestamp(value: number): string {
  return fullFormatter.format(new Date(value));
}

export function VersionHistoryPanel({ store, noteId, versions, requestedVersionId }: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [mode, setMode] = useState<PreviewMode>("diff");
  const parentRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const appliedRequestRef = useRef<string | null>(null);

  const selectCurrentMarkdown = useCallback(
    (state: RendererState) => state.documents.get(noteId)?.markdown ?? null,
    [noteId],
  );
  const currentMarkdown = useRendererSelector(store, selectCurrentMarkdown);
  const rows = useMemo(() => groupVersionRows(versions), [versions]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.kind === "group" ? GROUP_ROW_HEIGHT : VERSION_ROW_HEIGHT),
    overscan: 8,
  });

  function closePreview(): void {
    requestIdRef.current += 1;
    setPreview(null);
  }

  function openVersion(item: VersionListItem): void {
    if (preview?.versionId === item.versionId && preview.status !== "error") {
      closePreview();
      return;
    }
    loadVersion(item.versionId);
  }

  function loadVersion(versionId: string): void {
    const requestId = ++requestIdRef.current;
    setPreview({ status: "loading", versionId });
    readHistoryVersion(noteId, versionId)
      .then((content) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setPreview({ status: "ready", versionId, content, restoring: false });
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setPreview({
          status: "error",
          versionId,
          message: error instanceof Error ? error.message : "Could not load this version.",
        });
      });
  }

  function confirmRestore(): void {
    setPreview((current) => {
      if (current?.status !== "ready" || current.restoring) {
        return current;
      }
      const content = current.content;
      restoreNoteVersion(store, noteId, content.markdown)
        .then(() => {
          closePreview();
        })
        .catch((error: unknown) => {
          setPreview({
            status: "error",
            versionId: current.versionId,
            message: error instanceof Error ? error.message : "Restore failed.",
          });
        });
      return { ...current, restoring: true };
    });
  }

  function moveSelection(fromVersionId: string, direction: 1 | -1): void {
    const index = versions.findIndex((item) => item.versionId === fromVersionId);
    if (index === -1) {
      return;
    }
    const next = versions[Math.max(0, Math.min(versions.length - 1, index + direction))];
    focusVersion(next?.versionId ?? fromVersionId);
  }

  function focusVersion(versionId: string): void {
    const button = parentRef.current?.querySelector<HTMLButtonElement>(
      `[data-version-id="${CSS.escape(versionId)}"]`,
    );
    button?.focus();
  }

  useEffect(() => {
    if (!requestedVersionId || appliedRequestRef.current === requestedVersionId) {
      return;
    }
    const index = rows.findIndex(
      (row) => row.kind === "version" && row.item.versionId === requestedVersionId,
    );
    if (index === -1) {
      return;
    }
    appliedRequestRef.current = requestedVersionId;
    loadVersion(requestedVersionId);
    virtualizer.scrollToIndex(index, { align: "center" });
  }, [requestedVersionId, rows]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(232px,286px)_minmax(0,1fr)]">
      <div
        ref={parentRef}
        className="relative min-h-0 overflow-y-auto overscroll-contain border-r border-theme-divider px-2 pb-3"
        role="listbox"
        aria-label="Version history"
      >
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) {
              return null;
            }
            const style = {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: virtualRow.size,
              transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
            } as const;

            if (row.kind === "group") {
              return (
                <div key={row.key} style={style} className="flex items-end pb-1.5 pl-[15px] pr-2">
                  <span className="text-[10px] font-[650] uppercase tracking-[0.07em] text-muted-foreground/70">
                    {row.label}
                  </span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/50">
                    {row.count}
                  </span>
                </div>
              );
            }

            const version = row.item;
            const selected = preview?.versionId === version.versionId;
            const isHead = row.index === 0;
            return (
              <div key={row.key} style={style}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-version-id={version.versionId}
                  className={cn(
                    "group relative flex h-full w-full min-w-0 cursor-pointer flex-col justify-center gap-[3px] rounded-[var(--radius-md)] border-none bg-transparent py-2 pl-[30px] pr-2.5 text-left transition-colors",
                    "hover:bg-theme-hover focus-visible:bg-theme-hover focus-visible:outline-none",
                    selected && "bg-theme-active hover:bg-theme-active",
                  )}
                  onClick={() => openVersion(version)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveSelection(version.versionId, 1);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveSelection(version.versionId, -1);
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      const first = versions[0];
                      if (first) {
                        focusVersion(first.versionId);
                      }
                    } else if (event.key === "End") {
                      event.preventDefault();
                      const last = versions[versions.length - 1];
                      if (last) {
                        focusVersion(last.versionId);
                      }
                    }
                  }}
                  aria-posinset={row.index + 1}
                  aria-setsize={versions.length}
                >
                  <HistoryGraphRail
                    isFirst={row.index === 0}
                    isLast={row.index === versions.length - 1}
                    isHead={isHead}
                    isSelected={selected}
                  />
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors",
                        selected && "text-foreground",
                      )}
                      title={formatTimestamp(version.createdAt)}
                    >
                      {formatClock(version.createdAt)}
                    </span>
                    {isHead && (
                      <span className="shrink-0 rounded-full bg-success-soft px-1.5 py-px text-[9px] font-[650] uppercase tracking-[0.06em] text-success">
                        Latest
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/45 opacity-0 transition-opacity group-hover:opacity-100">
                      {formatRelativeTime(version.createdAt)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "block truncate text-[11px] leading-4 text-muted-foreground/55 transition-colors",
                      selected && "text-muted-foreground",
                    )}
                  >
                    {version.summary}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col">
        {!preview && <PreviewPlaceholder />}
        {preview?.status === "loading" && (
          <PreviewPlaceholder message="Loading revision…" muted />
        )}
        {preview?.status === "error" && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-divider px-4 py-2.5">
            <p className="m-0 text-[12px] text-destructive">{preview.message}</p>
            <PreviewCloseButton onClick={closePreview} />
          </div>
        )}
        {preview?.status === "ready" && (
          <>
            <div className="flex h-[46px] shrink-0 items-center gap-2.5 border-b border-theme-divider px-4">
              <span className="rounded-[var(--radius-sm)] bg-theme-hover px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-theme-secondary">
                r{preview.content.revision}
              </span>
              <span className="truncate text-[12px] font-[560] text-foreground">
                {formatTimestamp(preview.content.createdAt)}
              </span>
              {currentMarkdown !== null && (
                <DiffStats
                  versionMarkdown={preview.content.markdown}
                  currentMarkdown={currentMarkdown}
                />
              )}
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {currentMarkdown !== null && <ModeToggle mode={mode} onChange={setMode} />}
                <InlineConfirm
                  size="sm"
                  confirmLabel="Restore"
                  message="Replace current content?"
                  onConfirm={confirmRestore}
                  renderIdle={(arm) => (
                    <button
                      type="button"
                      className="inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] border border-border bg-transparent px-2.5 text-[12px] font-[560] text-foreground/85 transition-colors hover:bg-theme-hover hover:text-foreground disabled:opacity-60"
                      disabled={preview.restoring}
                      onClick={arm}
                    >
                      <RotateCcwIcon size={12} />
                      {preview.restoring ? "Restoring…" : "Restore"}
                    </button>
                  )}
                />
                <PreviewCloseButton onClick={closePreview} />
              </div>
            </div>
            {mode === "diff" && currentMarkdown !== null ? (
              <VersionDiffView
                versionMarkdown={preview.content.markdown}
                currentMarkdown={currentMarkdown}
              />
            ) : (
              <VersionMarkdownPreview markdown={preview.content.markdown} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

type PreviewPlaceholderProps = {
  message?: string;
  muted?: boolean;
};

function PreviewPlaceholder({ message, muted }: PreviewPlaceholderProps) {
  return (
    <div className="m-auto flex max-w-[38ch] flex-col items-center px-6 text-center">
      {!muted && (
        <span className="mb-3 grid size-9 place-items-center rounded-full bg-theme-hover text-theme-secondary">
          <HistoryIcon size={16} />
        </span>
      )}
      <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">
        {message ?? "Select a revision to preview its content and restore it."}
      </p>
    </div>
  );
}

type DiffStatsProps = {
  versionMarkdown: string;
  currentMarkdown: string;
};

function DiffStats({ versionMarkdown, currentMarkdown }: DiffStatsProps) {
  const diff = useMarkdownDiff(versionMarkdown, currentMarkdown);
  if (diff.stats.added === 0 && diff.stats.removed === 0) {
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground/70">Identical to now</span>
    );
  }
  return (
    <span
      className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums"
      title={`${diff.stats.added} lines added and ${diff.stats.removed} removed since this revision`}
    >
      <span className="diff-stat-added">+{diff.stats.added}</span>
      <span className="diff-stat-removed">−{diff.stats.removed}</span>
    </span>
  );
}

type ModeToggleProps = {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
};

const MODE_OPTIONS: readonly { value: PreviewMode; label: string }[] = [
  { value: "diff", label: "Changes" },
  { value: "full", label: "Revision" },
];

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Preview mode"
      className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] bg-theme-hover p-0.5"
    >
      {MODE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={mode === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-[22px] cursor-pointer rounded-[calc(var(--radius-md)-2px)] border-none bg-transparent px-2 text-[11px] font-[560] text-muted-foreground transition-colors hover:text-foreground",
            mode === option.value && "bg-theme-editor text-foreground shadow-sm",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type PreviewCloseButtonProps = {
  onClick: () => void;
};

function PreviewCloseButton({ onClick }: PreviewCloseButtonProps) {
  return (
    <button
      type="button"
      className="grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] border-none bg-transparent text-muted-foreground transition-colors hover:bg-theme-hover hover:text-foreground"
      aria-label="Close preview"
      onClick={onClick}
    >
      <CloseIcon size={13} />
    </button>
  );
}

type VersionMarkdownPreviewProps = {
  markdown: string;
};

function VersionMarkdownPreview({ markdown }: VersionMarkdownPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) {
      return;
    }
    host.replaceChildren();
    const node = parseHistoryMarkdown(markdown);
    host.append(DOMSerializer.fromSchema(productSchema).serializeFragment(node.content));
  }, [markdown]);
  return markdown.trim().length > 0 ? (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        ref={ref}
        className="prosemirror-host ProseMirror mx-auto w-full max-w-[70ch] px-8 py-6 text-[13px]"
      />
    </div>
  ) : (
    <PreviewPlaceholder message="This revision has no content." muted />
  );
}
