import { useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DOMSerializer } from "prosemirror-model";
import { restoreNoteVersion } from "../actions/workspace";
import type { HistoryVersionContent } from "../bridge/commands";
import { readHistoryVersion } from "../bridge/commands";
import { productSchema } from "../editor/schema";
import { CloseIcon, RotateCcwIcon } from "../shared/icons";
import { cn } from "../shared/lib/utils";
import { formatRelativeTime } from "../shared/lib/relative-time";
import { HistoryGraphRail } from "./history-graph-rail";
import { InlineConfirm } from "../shared/ui/inline-confirm";
import type { RendererStore } from "../store/types";
import { parseHistoryMarkdown, type VersionListItem } from "./version-model";

type Props = {
  store: RendererStore;
  noteId: string;
  versions: readonly VersionListItem[];
};

type PreviewState =
  | { status: "loading"; versionId: string }
  | { status: "error"; versionId: string; message: string }
  | { status: "ready"; versionId: string; content: HistoryVersionContent; restoring: boolean };

const ITEM_HEIGHT = 52;
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(value: number): string {
  return timeFormatter.format(new Date(value));
}

export function VersionHistoryPanel({ store, noteId, versions }: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const virtualizer = useVirtualizer({
    count: versions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
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
    const requestId = ++requestIdRef.current;
    setPreview({ status: "loading", versionId: item.versionId });
    readHistoryVersion(noteId, item.versionId)
      .then((content) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setPreview({ status: "ready", versionId: item.versionId, content, restoring: false });
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setPreview({
          status: "error",
          versionId: item.versionId,
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

  return (
    <div className="space-y-2">
      <div
        ref={parentRef}
        className="relative -mx-1 max-h-[220px] overflow-y-auto"
        role="listbox"
        aria-label="Version history"
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const version = versions[virtualRow.index];
            if (!version) {
              return null;
            }
            const selected = preview?.versionId === version.versionId;
            return (
              <div
                key={version.versionId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-version-id={version.versionId}
                  className={cn(
                    "group relative flex h-full w-full min-w-0 flex-col justify-center gap-0.5 rounded py-2 pl-9 pr-2 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none",
                    selected && "bg-muted/50",
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
                  aria-posinset={virtualRow.index + 1}
                  aria-setsize={versions.length}
                >
                  <HistoryGraphRail
                    isFirst={virtualRow.index === 0}
                    isLast={virtualRow.index === versions.length - 1}
                    isHead={virtualRow.index === 0}
                  />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="shrink-0 text-[11px] text-muted-foreground"
                      title={formatTimestamp(version.createdAt)}
                    >
                      {formatRelativeTime(version.createdAt)}
                    </span>
                  </div>
                  <p className="m-0 truncate text-[11px] leading-4 text-muted-foreground/50">
                    {version.summary}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {preview && (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-muted/20">
          {preview.status === "loading" && (
            <p className="m-0 px-2.5 py-2 text-[11px] text-muted-foreground">Loading version…</p>
          )}
          {preview.status === "error" && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-2">
              <p className="m-0 text-[11px] text-destructive">{preview.message}</p>
              <PreviewCloseButton onClick={closePreview} />
            </div>
          )}
          {preview.status === "ready" && (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {formatTimestamp(preview.content.createdAt)}
                </span>
                <PreviewCloseButton onClick={closePreview} />
              </div>
              <VersionMarkdownPreview markdown={preview.content.markdown} />
              <div className="border-t border-border px-2.5 py-1.5">
                <InlineConfirm
                  size="sm"
                  confirmLabel="Restore"
                  message="Replace current content? The current version stays in history."
                  messagePlacement="stacked"
                  onConfirm={confirmRestore}
                  renderIdle={(arm) => (
                    <button
                      type="button"
                      className="inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-md)] border border-border bg-transparent px-[8px] text-[11px] font-[560] text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                      disabled={preview.restoring}
                      onClick={arm}
                    >
                      <RotateCcwIcon size={12} />
                      {preview.restoring ? "Restoring…" : "Restore this version"}
                    </button>
                  )}
                />
              </div>
            </>
          )}
        </div>
      )}
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
      className="flex shrink-0 cursor-pointer rounded-[var(--radius)] border-none bg-transparent p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
    <div
      ref={ref}
      className="prosemirror-host ProseMirror max-h-[220px] overflow-y-auto px-2.5 py-2 text-[12px]"
    />
  ) : (
    <p className="m-0 px-2.5 py-2 text-[11px] text-muted-foreground">
      This version has no content.
    </p>
  );
}
