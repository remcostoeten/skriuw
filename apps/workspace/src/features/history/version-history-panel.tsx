import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { DOMSerializer } from "prosemirror-model";
import { restoreNoteVersion } from "@/features/history/restore-version";
import type { HistoryVersionContent } from "@/platform/runtime/commands";
import { readHistoryVersion } from "@/platform/runtime/commands";
import { productSchema } from "@/features/editor/schema";
import { cn } from "@/shared/styling/class-names";
import { showToast } from "@/shared/ui/toast";
import { useMediaQuery } from "@/shared/viewport/use-media-query";
import { COMPACT_VIEWPORT_QUERY } from "@/shared/viewport/queries";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { setHistoryDiffLayout } from "./diff";
import { historyDiffLayout } from "./diff/layout-setting";
import type { DiffLayout } from "./diff/split-model";
import { VersionDiffView } from "./diff/view";
import { ReadingHeader, type PreviewMode } from "./reading-header";
import { parseHistoryMarkdown } from "./restore";
import { buildLedgerRows, stepVersionId } from "./timeline/ledger-model";
import { HistoryScrubber } from "./timeline/scrubber";
import { VersionLedger, type LedgerFocusRequest } from "./timeline/version-ledger";
import { formatVersionDay, formatVersionTimestamp, type VersionListItem } from "./versions/model";

type Props = {
  store: RendererStore;
  noteId: string;
  versions: readonly VersionListItem[];
  requestedVersionId?: string | null;
  onBack: () => void;
};

type PreviewState =
  | { status: "loading"; versionId: string; stale: HistoryVersionContent | null }
  | { status: "error"; versionId: string; message: string }
  | { status: "ready"; versionId: string; content: HistoryVersionContent; restoring: boolean };

function selectDiffLayout(state: RendererState): DiffLayout {
  return historyDiffLayout(state.settings);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

function isTextEntry(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement)
  );
}

function copyMarkdown(markdown: string): void {
  navigator.clipboard
    .writeText(markdown)
    .then(() => showToast({ message: "Revision copied as Markdown" }))
    .catch((error: unknown) => {
      showToast({ message: errorMessage(error, "Could not copy this revision.") });
    });
}

export function VersionHistoryPanel({
  store,
  noteId,
  versions,
  requestedVersionId,
  onBack,
}: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [mode, setMode] = useState<PreviewMode>("diff");
  const [scrubVersionId, setScrubVersionId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<LedgerFocusRequest | null>(null);
  const compact = useMediaQuery(COMPACT_VIEWPORT_QUERY);
  const requestIdRef = useRef(0);
  const appliedRequestRef = useRef<string | null>(null);
  const autoOpenedRef = useRef(false);
  const contentCacheRef = useRef(new Map<string, HistoryVersionContent>());
  const pendingRef = useRef(new Map<string, Promise<HistoryVersionContent>>());
  const scrubTargetRef = useRef<string | null>(null);
  const scrubFetchingRef = useRef(false);

  const selectCurrentMarkdown = useCallback(
    (state: RendererState) => state.documents.get(noteId)?.markdown ?? null,
    [noteId],
  );
  const currentMarkdown = useRendererSelector(store, selectCurrentMarkdown);
  const diffLayout = useRendererSelector(store, selectDiffLayout);
  const layout: DiffLayout = compact ? "unified" : diffLayout;
  const rows = useMemo(() => buildLedgerRows(versions), [versions]);

  const selectedVersionId = scrubVersionId ?? preview?.versionId ?? null;
  const selectedIndex = useMemo(() => {
    const index = versions.findIndex((item) => item.versionId === selectedVersionId);
    return index === -1 ? null : index;
  }, [versions, selectedVersionId]);
  const selectedItem = selectedIndex === null ? null : (versions[selectedIndex] ?? null);

  function requestFocus(versionId: string, focus: boolean): void {
    setFocusRequest((previous) => ({ versionId, focus, nonce: (previous?.nonce ?? 0) + 1 }));
  }

  function closePreview(): void {
    requestIdRef.current += 1;
    scrubTargetRef.current = null;
    setScrubVersionId(null);
    setPreview(null);
  }

  function fetchVersion(versionId: string): Promise<HistoryVersionContent> {
    const cached = contentCacheRef.current.get(versionId);
    if (cached) {
      return Promise.resolve(cached);
    }
    const pending = pendingRef.current.get(versionId);
    if (pending) {
      return pending;
    }
    const request = readHistoryVersion(noteId, versionId).then(
      (content) => {
        contentCacheRef.current.set(versionId, content);
        pendingRef.current.delete(versionId);
        return content;
      },
      (error: unknown) => {
        pendingRef.current.delete(versionId);
        throw error;
      },
    );
    pendingRef.current.set(versionId, request);
    return request;
  }

  function warmVersion(versionId: string): void {
    if (contentCacheRef.current.has(versionId) || pendingRef.current.has(versionId)) {
      return;
    }
    fetchVersion(versionId).catch(() => pendingRef.current.delete(versionId));
  }

  function staleContent(): HistoryVersionContent | null {
    if (preview?.status === "ready") {
      return preview.content;
    }
    return preview?.status === "loading" ? preview.stale : null;
  }

  function scrubToIndex(listIndex: number): void {
    const item = versions[listIndex];
    if (!item) {
      return;
    }
    scrubTargetRef.current = item.versionId;
    setScrubVersionId(item.versionId);
    if (!compact) {
      requestFocus(item.versionId, false);
    }
    fetchScrubTarget();
  }

  function fetchScrubTarget(): void {
    const versionId = scrubTargetRef.current;
    if (versionId === null || scrubFetchingRef.current) {
      return;
    }
    const cached = contentCacheRef.current.get(versionId);
    if (cached) {
      requestIdRef.current += 1;
      setPreview({ status: "ready", versionId, content: cached, restoring: false });
      return;
    }
    scrubFetchingRef.current = true;
    fetchVersion(versionId)
      .then(() => {
        scrubFetchingRef.current = false;
        fetchScrubTarget();
      })
      .catch((error: unknown) => {
        scrubFetchingRef.current = false;
        if (scrubTargetRef.current !== versionId) {
          fetchScrubTarget();
          return;
        }
        requestIdRef.current += 1;
        setPreview({
          status: "error",
          versionId,
          message: errorMessage(error, "Could not load this version."),
        });
      });
  }

  function loadVersion(versionId: string): void {
    const requestId = ++requestIdRef.current;
    scrubTargetRef.current = null;
    setScrubVersionId(null);
    const cached = contentCacheRef.current.get(versionId);
    if (cached) {
      setPreview({ status: "ready", versionId, content: cached, restoring: false });
      return;
    }
    setPreview({ status: "loading", versionId, stale: staleContent() });
    fetchVersion(versionId)
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
          message: errorMessage(error, "Could not load this version."),
        });
      });
  }

  function stepVersion(step: 1 | -1): void {
    const next = stepVersionId(versions, selectedVersionId, step);
    if (next !== null && next !== selectedVersionId) {
      loadVersion(next);
      requestFocus(next, false);
    }
  }

  function copyVersion(versionId: string): void {
    const cached = contentCacheRef.current.get(versionId);
    if (cached) {
      copyMarkdown(cached.markdown);
      return;
    }
    fetchVersion(versionId)
      .then((content) => copyMarkdown(content.markdown))
      .catch((error: unknown) => {
        showToast({ message: errorMessage(error, "Could not copy this revision.") });
      });
  }

  function confirmRestore(): void {
    const previousMarkdown = currentMarkdown;
    setPreview((current) => {
      if (current?.status !== "ready" || current.restoring) {
        return current;
      }
      const content = current.content;
      restoreNoteVersion(store, noteId, content.markdown)
        .then(() => {
          closePreview();
          showToast({
            message: `Restored revision from ${formatVersionTimestamp(content.createdAt)}`,
            action:
              previousMarkdown === null
                ? undefined
                : {
                    label: "Undo",
                    run: () => {
                      restoreNoteVersion(store, noteId, previousMarkdown).catch(
                        (error: unknown) => {
                          showToast({
                            message: errorMessage(error, "Could not undo the restore."),
                          });
                        },
                      );
                    },
                  },
          });
        })
        .catch((error: unknown) => {
          setPreview({
            status: "error",
            versionId: current.versionId,
            message: errorMessage(error, "Restore failed."),
          });
        });
      return { ...current, restoring: true };
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (selectedVersionId !== null && !compact) {
        const versionId = selectedVersionId;
        closePreview();
        requestFocus(versionId, true);
        return;
      }
      onBack();
      return;
    }
    if (isTextEntry(event.target)) {
      return;
    }
    if ((event.key === "c" || event.key === "C") && preview?.status === "ready") {
      event.preventDefault();
      copyMarkdown(preview.content.markdown);
    }
  }

  useEffect(() => {
    if (!requestedVersionId || appliedRequestRef.current === requestedVersionId) {
      return;
    }
    if (!versions.some((item) => item.versionId === requestedVersionId)) {
      return;
    }
    appliedRequestRef.current = requestedVersionId;
    autoOpenedRef.current = true;
    loadVersion(requestedVersionId);
    requestFocus(requestedVersionId, !compact);
  }, [requestedVersionId, versions]);

  useEffect(() => {
    const newest = versions[0];
    if (preview !== null || requestedVersionId || !newest) {
      return;
    }
    if (compact || !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      loadVersion(newest.versionId);
      requestFocus(newest.versionId, !compact);
    }
  }, [compact]);

  const content = preview?.status === "ready" ? preview.content : staleContent();
  const dimmed =
    preview?.status === "loading" ||
    (scrubVersionId !== null && scrubVersionId !== preview?.versionId);

  return (
    <div
      className={cn(
        "grid h-full min-h-0",
        compact ? "grid-cols-1" : "grid-cols-[minmax(272px,320px)_minmax(0,1fr)]",
      )}
      onKeyDown={handleKeyDown}
    >
      <aside
        aria-label="Revisions"
        className={cn(
          "flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar pt-2",
          compact && "hidden",
        )}
      >
        <VersionLedger
          versions={versions}
          rows={rows}
          openVersionId={selectedVersionId}
          focusRequest={focusRequest}
          onOpen={loadVersion}
          onCopy={copyVersion}
          onWarm={warmVersion}
        />
        {versions.length === 1 && (
          <p className="m-0 border-t border-theme-divider/85 px-5 py-3 text-xs leading-[1.45] text-theme-secondary">
            One revision so far. Skriuw captures the next one after a pause in typing.
          </p>
        )}
        <p
          id="history-keyboard-help"
          className="m-0 flex flex-wrap gap-x-2.5 gap-y-[5px] border-t border-theme-divider/85 px-4 py-2.5 text-[10.5px] whitespace-nowrap text-theme-dim"
        >
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> Move
          </span>
          <span>
            <kbd>Enter</kbd> Open
          </span>
          <span>
            <kbd>C</kbd> Copy
          </span>
          <span>
            <kbd>Esc</kbd> {selectedVersionId === null ? "Back to note" : "Close"}
          </span>
        </p>
      </aside>

      <section aria-label="Revision" className="relative flex min-h-0 min-w-0 flex-col">
        {versions.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
            <HistoryScrubber
              versions={versions}
              selectedIndex={selectedIndex}
              onScrub={scrubToIndex}
            />
          </div>
        )}
        {selectedItem === null || selectedIndex === null ? (
          <ClosedPlaceholder count={versions.length} />
        ) : (
          <>
            <ReadingHeader
              item={selectedItem}
              position={versions.length - selectedIndex}
              total={versions.length}
              dayLabel={formatVersionDay(selectedItem.createdAt)}
              versionMarkdown={preview?.status === "ready" ? preview.content.markdown : null}
              currentMarkdown={currentMarkdown}
              mode={mode}
              layout={layout}
              showLayout={currentMarkdown !== null && !compact}
              restoring={preview?.status === "ready" && preview.restoring}
              hasNewer={selectedIndex > 0}
              hasOlder={selectedIndex < versions.length - 1}
              onMode={setMode}
              onLayout={(next) => setHistoryDiffLayout(store, next)}
              onStep={stepVersion}
              onCopy={() => {
                if (preview?.status === "ready") {
                  copyMarkdown(preview.content.markdown);
                }
              }}
              onRestore={confirmRestore}
              onClose={() => {
                const versionId = selectedVersionId;
                closePreview();
                if (versionId !== null && !compact) {
                  requestFocus(versionId, true);
                }
              }}
            />
            {preview?.status === "error" && (
              <p
                role="alert"
                className="mx-5 mt-3 mb-0 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive"
              >
                {preview.message}
              </p>
            )}
            {content !== null && (
              <div
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col transition-opacity duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  dimmed && "opacity-55",
                )}
              >
                {mode === "diff" && currentMarkdown !== null ? (
                  <VersionDiffView
                    versionMarkdown={content.markdown}
                    currentMarkdown={currentMarkdown}
                    layout={layout}
                  />
                ) : (
                  <VersionMarkdownPreview markdown={content.markdown} />
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

type ClosedPlaceholderProps = {
  count: number;
};

function ClosedPlaceholder({ count }: ClosedPlaceholderProps) {
  return (
    <div className="m-auto flex max-w-[40ch] flex-col items-center gap-1.5 px-6 pb-24 text-center">
      <p className="m-0 text-[13px] font-medium text-foreground">
        {count === 1 ? "One revision" : `${count} revisions`}
      </p>
      <p className="m-0 text-xs leading-[1.5] text-theme-secondary">
        Pick a revision to compare it with the note now. <kbd>Enter</kbd> opens the highlighted one,{" "}
        <kbd>Esc</kbd> goes back to the note.
      </p>
    </div>
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
        className="prosemirror-host ProseMirror mx-auto w-full max-w-[70ch] px-8 pb-32 pt-6 text-[13px]"
      />
    </div>
  ) : (
    <p className="m-auto px-6 pb-24 text-xs text-theme-secondary">This revision has no content.</p>
  );
}
