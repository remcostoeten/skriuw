import { useLayoutEffect, useRef, useState } from "react";
import { DOMSerializer } from "prosemirror-model";
import { restoreNoteVersion } from "../actions/workspace";
import type { HistoryVersionContent } from "../bridge/commands";
import { readHistoryVersion } from "../bridge/commands";
import { productSchema } from "../editor/schema";
import { RotateCcwIcon } from "../shared/icons";
import { Dialog } from "../shared/ui/dialog";
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
  | {
      status: "ready";
      content: HistoryVersionContent;
      mode: "preview" | "confirm" | "restoring";
    };

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(value: number): string {
  return timeFormatter.format(new Date(value));
}

export function VersionHistoryPanel({ store, noteId, versions }: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const requestIdRef = useRef(0);

  function closePreview(): void {
    setPreview(null);
  }

  function openVersion(item: VersionListItem): void {
    const requestId = ++requestIdRef.current;
    setPreview({ status: "loading", versionId: item.versionId });
    readHistoryVersion(noteId, item.versionId)
      .then((content) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setPreview({ status: "ready", content, mode: "preview" });
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

  function requestRestore(): void {
    setPreview((current) =>
      current?.status === "ready" ? { ...current, mode: "confirm" } : current,
    );
  }

  function cancelRestore(): void {
    setPreview((current) =>
      current?.status === "ready" ? { ...current, mode: "preview" } : current,
    );
  }

  function confirmRestore(): void {
    setPreview((current) => {
      if (current?.status !== "ready") {
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
            versionId: content.versionId,
            message: error instanceof Error ? error.message : "Restore failed.",
          });
        });
      return { ...current, mode: "restoring" };
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
    const button = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-version-id="${CSS.escape(versionId)}"]`,
    );
    button?.focus();
  }

  const dialogTitle =
    preview?.status === "ready" && preview.mode === "confirm"
      ? "Restore this version?"
      : "Version preview";

  return (
    <>
      <ol ref={listRef} className="relative -mx-1 list-none p-0">
        {versions.map((version, index) => (
          <li key={version.versionId}>
            <button
              type="button"
              data-version-id={version.versionId}
              className="flex w-full min-w-0 flex-col gap-0.5 rounded px-1 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
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
              aria-posinset={index + 1}
              aria-setsize={versions.length}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatTimestamp(version.createdAt)}
                </span>
              </div>
              <p className="m-0 truncate text-[11px] leading-4 text-muted-foreground/50">
                {version.summary}
              </p>
            </button>
          </li>
        ))}
      </ol>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
          }
        }}
        title={dialogTitle}
        className="version-preview-dialog"
      >
        {preview?.status === "loading" && (
          <p className="m-0 text-sm text-muted-foreground">Loading version…</p>
        )}
        {preview?.status === "error" && (
          <div className="space-y-3">
            <p className="m-0 text-sm text-destructive">{preview.message}</p>
          </div>
        )}
        {preview?.status === "ready" && preview.mode !== "confirm" && (
          <div className="space-y-4">
            <div className="text-[11px] text-muted-foreground">
              {formatTimestamp(preview.content.createdAt)}
            </div>
            <VersionMarkdownPreview markdown={preview.content.markdown} />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                onClick={closePreview}
              >
                Close
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
                onClick={requestRestore}
                disabled={preview.mode === "restoring"}
              >
                <RotateCcwIcon size={14} />
                Restore this version
              </button>
            </div>
          </div>
        )}
        {preview?.status === "ready" && preview.mode === "confirm" && (
          <div className="space-y-4">
            <p className="m-0 text-sm text-foreground">
              This replaces the current content with the selected version. The current content
              stays in history and can be restored again.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                onClick={cancelRestore}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:opacity-90"
                onClick={confirmRestore}
              >
                Restore
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
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
      className="prosemirror-host ProseMirror max-h-[45vh] overflow-y-auto text-sm"
    />
  ) : (
    <p className="m-0 text-sm text-muted-foreground">This version has no content.</p>
  );
}
