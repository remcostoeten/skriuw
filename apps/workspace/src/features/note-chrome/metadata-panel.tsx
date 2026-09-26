import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { cn } from "@/shared/lib/utils";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  HistoryIcon,
  RotateCcwIcon,
} from "@/shared/icons/static";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { showToast } from "@/shared/ui/toast";
import { readHistoryVersion } from "@/bridge/commands";
import { restoreNoteVersion } from "@/store/actions/workspace";
import { SectionToggle, sectionLabelClass } from "@/shared/ui/section-header";
import { Collapse } from "@/shared/ui/collapse";
import {
  formatVersionClock,
  formatVersionTimestamp,
  groupVersionRows,
  projectVersionList,
  type VersionListItem,
  type VersionRow,
} from "@/features/history/version-model";
import { VersionStats } from "@/features/history/version-stats";
import { noteHistoryHash } from "@skriuw/renderer-core/route/app-route";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { NoteOutline } from "./note-outline";
import { AnnotationList } from "./annotation-list";
import { RelationshipExplorer } from "@/features/references/relationship-explorer";
import { projectHasRelationships } from "@/features/references/relationship-model";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";

type Props = {
  store: RendererStore;
};

type SectionKey = "outline" | "annotations" | "revisions" | "details" | "relationships";

type SectionProps = {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  keepMounted?: boolean;
};

function InspectorSection({
  id,
  title,
  open,
  onToggle,
  children,
  className,
  keepMounted = false,
}: SectionProps) {
  const [rendered, setRendered] = useState(open || keepMounted);
  if ((open || keepMounted) && !rendered) {
    setRendered(true);
  }

  return (
    <section
      aria-labelledby={id}
      className={cn("group relative border-b border-border/60", className)}
    >
      <SectionToggle id={id} title={title} open={open} onToggle={onToggle} />
      {rendered && (
        <Collapse open={open}>
          <div className="px-4 pb-2.5 pt-2.5">{children}</div>
        </Collapse>
      )}
    </section>
  );
}

const asideClass = "flex h-full min-h-0 w-full flex-col border-l border-border bg-background";

const OPEN_STORAGE_KEY = "skriuw.inspector-sections-open";

const defaultOpenSections: Record<SectionKey, boolean> = {
  outline: true,
  annotations: true,
  revisions: true,
  details: true,
  relationships: true,
};

function readOpenSections(): Record<SectionKey, boolean> {
  try {
    const stored = window.localStorage.getItem(OPEN_STORAGE_KEY);
    if (stored === null) {
      return defaultOpenSections;
    }
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) {
      return defaultOpenSections;
    }
    const next = { ...defaultOpenSections };
    for (const key of Object.keys(next) as SectionKey[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "boolean") {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return defaultOpenSections;
  }
}

function writeOpenSections(sections: Record<SectionKey, boolean>): void {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(sections));
  } catch {
    return;
  }
}

const collapsedRevisionCount = 6;

const REVISION_HEIGHT_STORAGE_KEY = "skriuw.inspector-revisions-height";
const defaultRevisionHeight = 256;
const minRevisionHeight = 96;
const revisionHeightStep = 24;

function readRevisionHeight(): number {
  try {
    const stored = Number(window.localStorage.getItem(REVISION_HEIGHT_STORAGE_KEY));
    return stored >= minRevisionHeight ? stored : defaultRevisionHeight;
  } catch {
    return defaultRevisionHeight;
  }
}

function writeRevisionHeight(height: number): void {
  try {
    window.localStorage.setItem(REVISION_HEIGHT_STORAGE_KEY, String(height));
  } catch {
    return;
  }
}

const quietActionClass =
  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap bg-transparent p-0 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground";

function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

async function copyRevisionMarkdown(noteId: string, versionId: string): Promise<void> {
  try {
    const content = await readHistoryVersion(noteId, versionId);
    await navigator.clipboard.writeText(content.markdown);
    showToast({ message: "Revision copied as Markdown" });
  } catch (error) {
    showToast({
      message: failureMessage(error, "Could not copy this revision."),
    });
  }
}

async function restoreRevision(
  store: RendererStore,
  noteId: string,
  versionId: string,
): Promise<void> {
  const previousMarkdown = store.getState().documents.get(noteId)?.markdown;
  try {
    const content = await readHistoryVersion(noteId, versionId);
    await restoreNoteVersion(store, noteId, content.markdown);
    showToast({
      message: `Restored revision from ${formatVersionTimestamp(content.createdAt)}`,
      action:
        previousMarkdown === undefined
          ? undefined
          : {
              label: "Undo",
              run: () => {
                restoreNoteVersion(store, noteId, previousMarkdown).catch((error: unknown) => {
                  showToast({
                    message: failureMessage(error, "Could not undo the restore."),
                  });
                });
              },
            },
    });
  } catch (error) {
    showToast({ message: failureMessage(error, "Restore failed.") });
  }
}

type RevisionActions = {
  open: (versionId: string) => void;
  copy: (versionId: string) => void;
  restore: (versionId: string) => void;
};

type RevisionRowsProps = {
  rows: readonly VersionRow[];
  label: string;
  actions: RevisionActions;
  className?: string;
};

function RevisionRows({ rows, label, actions, className }: RevisionRowsProps) {
  return (
    <ul aria-label={label} className={cn("m-0 list-none p-0", className)}>
      {rows.map((row) =>
        row.kind === "group" ? (
          <li key={row.key} className={cn(sectionLabelClass, "px-2 pb-1 pt-2.5")}>
            {row.label}
          </li>
        ) : (
          <li key={row.key} data-revision-row="">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => actions.open(row.item.versionId)}
                  title={formatVersionTimestamp(row.item.createdAt)}
                  className="group/revision flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] bg-transparent px-2 py-1 text-left transition-colors hover:bg-muted"
                >
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors group-hover/revision:text-foreground">
                    {formatVersionClock(row.item.createdAt)}
                  </span>
                  <span className="min-w-0 truncate text-[10px] text-muted-foreground/45 opacity-0 transition-opacity group-hover/revision:opacity-100">
                    {formatRelativeTime(row.item.createdAt)}
                  </span>
                  <VersionStats wordDelta={row.item.wordDelta} />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem
                  className="gap-2"
                  onSelect={() => actions.open(row.item.versionId)}
                >
                  <HistoryIcon size={14} />
                  Open in history
                </ContextMenuItem>
                <ContextMenuItem
                  className="gap-2"
                  onSelect={() => actions.copy(row.item.versionId)}
                >
                  <CopyIcon size={14} />
                  Copy as Markdown
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="gap-2"
                  onSelect={() => actions.restore(row.item.versionId)}
                >
                  <RotateCcwIcon size={14} />
                  Restore this version
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * Counts revision rows in `scroller` that are less than half visible above its
 * bottom edge, so the "N more" affordance tracks the resized viewport.
 */
function countRevisionsBelowFold(scroller: HTMLElement): number {
  const fold = scroller.getBoundingClientRect().bottom;
  let count = 0;
  for (const row of scroller.querySelectorAll<HTMLElement>("[data-revision-row]:not([inert] *)")) {
    const rect = row.getBoundingClientRect();
    if (rect.top + rect.height / 2 > fold) {
      count += 1;
    }
  }
  return count;
}

/**
 * Index of the row just past the `limit`-th revision, so the list can split
 * into an always-visible head and a collapsible tail. Day headers stay with the
 * revisions they introduce and the two halves render flush, so the seam is
 * invisible once expanded.
 */
function findRevisionSplit(rows: readonly VersionRow[], limit: number): number {
  let seen = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.kind === "version") {
      seen += 1;
      if (seen === limit) {
        return index + 1;
      }
    }
  }
  return rows.length;
}

type RevisionListProps = {
  store: RendererStore;
  noteId: string;
  versions: readonly VersionListItem[];
  onOpen: (versionId?: string) => void;
};

function RevisionList({ store, noteId, versions, onOpen }: RevisionListProps) {
  const [expanded, setExpanded] = useState(false);
  const [maxHeight, setMaxHeight] = useState(readRevisionHeight);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    height: number;
  } | null>(null);
  const [belowFoldCount, setBelowFoldCount] = useState(0);
  const hiddenCount = versions.length - collapsedRevisionCount;
  const collapsedTailCount = expanded ? 0 : Math.max(0, hiddenCount);
  const moreCount = belowFoldCount + collapsedTailCount;
  const rows = useMemo(() => groupVersionRows(versions), [versions]);
  const splitIndex = useMemo(() => findRevisionSplit(rows, collapsedRevisionCount), [rows]);

  function measureBelowFold(): void {
    if (scrollerRef.current) {
      setBelowFoldCount(countRevisionsBelowFold(scrollerRef.current));
    }
  }

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    setBelowFoldCount(countRevisionsBelowFold(scroller));
    const observer = new ResizeObserver(() => {
      setBelowFoldCount(countRevisionsBelowFold(scroller));
    });
    observer.observe(scroller);
    for (const child of scroller.children) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, [rows, expanded, maxHeight]);

  if (versions.length === 0) {
    return <p className="m-0 text-[13px] text-muted-foreground/70">No revisions yet</p>;
  }

  const tail = rows.slice(splitIndex);
  const actions: RevisionActions = {
    open: onOpen,
    copy: (versionId) => void copyRevisionMarkdown(noteId, versionId),
    restore: (versionId) => void restoreRevision(store, noteId, versionId),
  };
  const fitsAll = !Number.isFinite(maxHeight);

  function revealTail(): void {
    if (hiddenCount > 0 && !expanded) {
      setExpanded(true);
    }
  }

  function clampHeight(height: number): number {
    const content = scrollerRef.current?.scrollHeight ?? height;
    return Math.round(Math.max(minRevisionHeight, Math.min(height, content)));
  }

  function commitHeight(height: number): void {
    setMaxHeight(height);
    writeRevisionHeight(height);
  }

  function renderedHeight(): number {
    return scrollerRef.current?.getBoundingClientRect().height ?? defaultRevisionHeight;
  }

  function showMoreOrLess(): void {
    const scroller = scrollerRef.current;
    if (moreCount === 0) {
      setExpanded(false);
      scroller?.scrollTo({ top: 0 });
      return;
    }
    if (belowFoldCount === 0 || !scroller) {
      setExpanded(true);
      return;
    }
    scroller.scrollBy({ top: scroller.clientHeight, behavior: "smooth" });
  }

  function toggleFitAll(): void {
    if (fitsAll) {
      commitHeight(defaultRevisionHeight);
      return;
    }
    revealTail();
    commitHeight(Number.POSITIVE_INFINITY);
  }

  return (
    <div className="space-y-1.5">
      <div
        ref={scrollerRef}
        style={{ maxHeight: fitsAll ? "none" : maxHeight }}
        onScroll={measureBelowFold}
        className="overflow-y-auto overscroll-contain"
      >
        <RevisionRows
          rows={rows.slice(0, splitIndex)}
          label="Revisions"
          actions={actions}
          className="[&>li:first-child]:pt-0"
        />
        {tail.length > 0 && (
          <Collapse open={expanded}>
            <RevisionRows rows={tail} label="Older revisions" actions={actions} />
          </Collapse>
        )}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize revision list"
        aria-valuenow={fitsAll ? undefined : Math.round(maxHeight)}
        aria-valuemin={minRevisionHeight}
        tabIndex={0}
        title="Drag to resize · double-click to show all"
        className="group/grip -mb-1 flex h-2 cursor-row-resize touch-none items-center justify-center rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const startHeight = renderedHeight();
          dragRef.current = {
            startY: event.clientY,
            startHeight,
            height: startHeight,
          };
          revealTail();
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const scroller = scrollerRef.current;
          if (!drag || !scroller) {
            return;
          }
          drag.height = clampHeight(drag.startHeight + event.clientY - drag.startY);
          scroller.style.maxHeight = `${drag.height}px`;
          measureBelowFold();
        }}
        onPointerUp={() => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (drag && drag.height !== drag.startHeight) {
            commitHeight(drag.height);
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          if (scrollerRef.current) {
            scrollerRef.current.style.maxHeight = fitsAll ? "none" : `${maxHeight}px`;
          }
          measureBelowFold();
        }}
        onDoubleClick={toggleFitAll}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            toggleFitAll();
            return;
          }
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
            return;
          }
          event.preventDefault();
          const step = event.shiftKey ? revisionHeightStep * 4 : revisionHeightStep;
          if (event.key === "ArrowDown") {
            revealTail();
          }
          commitHeight(clampHeight(renderedHeight() + (event.key === "ArrowDown" ? step : -step)));
        }}
      >
        <span className="h-[3px] w-8 rounded-full bg-border opacity-50 transition-opacity duration-150 group-hover/grip:opacity-100 group-focus-visible/grip:opacity-100 group-active/grip:bg-muted-foreground/60" />
      </div>
      <div className="flex items-center gap-3 px-2 pt-1">
        {(moreCount > 0 || expanded) && (
          <button
            type="button"
            onClick={showMoreOrLess}
            aria-expanded={moreCount === 0}
            className={quietActionClass}
          >
            <ChevronDownIcon
              size={10}
              className={cn(
                "transition-transform duration-150 motion-reduce:transition-none",
                moreCount === 0 && "rotate-180",
              )}
            />
            {moreCount === 0 ? "Show less" : `${moreCount} more`}
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpen()}
          className={cn(quietActionClass, "ml-auto gap-0.5")}
        >
          Open history
          <ChevronRightIcon size={11} />
        </button>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Bytes`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

function selectActiveNoteId(state: RendererState): string | null {
  return state.activeNoteId;
}

function selectActiveNoteMetadata(state: RendererState) {
  return state.activeNoteId === null ? null : (state.metadata.get(state.activeNoteId) ?? null);
}

function selectActiveNoteHistory(state: RendererState) {
  return state.activeNoteId === null
    ? null
    : (state.historyHeaders.get(state.activeNoteId) ?? null);
}

function selectActiveNoteCreatedAt(state: RendererState): number | null {
  return state.activeNoteId === null
    ? null
    : (state.sourceNodes.get(state.activeNoteId)?.createdAt ?? null);
}

function selectActiveNoteMarkdown(state: RendererState): string | null {
  return state.activeNoteId === null
    ? null
    : (state.documents.get(state.activeNoteId)?.markdown ?? null);
}

export function MetadataPanel({ store }: Props) {
  const activeNoteId = useRendererSelector(store, selectActiveNoteId);
  const metadata = useRendererSelector(store, selectActiveNoteMetadata);
  const historyHeaders = useRendererSelector(store, selectActiveNoteHistory);
  const versions = useMemo(() => projectVersionList(historyHeaders), [historyHeaders]);
  const createdAt = useRendererSelector(store, selectActiveNoteCreatedAt);
  const markdown = useRendererSelector(store, selectActiveNoteMarkdown);
  const hasRelationships = useRendererSelector(
    store,
    useCallback(
      (state: RendererState) =>
        activeNoteId !== null && projectHasRelationships(state, activeNoteId),
      [activeNoteId],
    ),
  );
  const annotationCount = useRendererSelector(
    store,
    useCallback(
      (state: RendererState) =>
        activeNoteId === null
          ? 0
          : [...state.annotations.values()].filter(
              (annotation) => annotation.noteId === activeNoteId,
            ).length,
      [activeNoteId],
    ),
  );
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(readOpenSections);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [outlineCount, setOutlineCount] = useState(0);
  const handleOutlineCountChange = useCallback((count: number) => setOutlineCount(count), []);

  function toggleSection(section: SectionKey): void {
    setOpenSections((current) => {
      const next = { ...current, [section]: !current[section] };
      writeOpenSections(next);
      return next;
    });
  }

  if (!metadata) {
    return <aside className={asideClass} aria-label="Note metadata" />;
  }

  const charCount = markdown?.length ?? 0;
  const readTimeMinutes = Math.max(1, Math.ceil(metadata.wordCount / 200));
  const detailRows = [
    { label: "Words", value: metadata.wordCount.toLocaleString() },
    { label: "Characters", value: charCount.toLocaleString() },
    { label: "Read time", value: `${readTimeMinutes}m` },
    ...(markdown !== null
      ? [{ label: "File size", value: formatFileSize(new Blob([markdown]).size) }]
      : []),
    ...(createdAt !== null ? [{ label: "Created", value: formatDateTime(createdAt) }] : []),
    { label: "Updated", value: formatDateTime(metadata.updatedAt) },
  ];

  return (
    <aside className={asideClass} aria-label="Note metadata">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {activeNoteId && (
          <InspectorSection
            id="metadata-outline"
            title="Outline"
            open={openSections.outline}
            onToggle={() => toggleSection("outline")}
            className={outlineCount <= 1 ? "hidden" : undefined}
            keepMounted
          >
            <div data-outline-scroll className="max-h-[38dvh] overflow-y-auto overscroll-contain">
              <NoteOutline
                key={activeNoteId}
                store={store}
                onCountChange={handleOutlineCountChange}
              />
            </div>
          </InspectorSection>
        )}
        {activeNoteId && annotationCount > 0 && (
          <InspectorSection
            id="metadata-annotations"
            title="Comments"
            open={openSections.annotations}
            onToggle={() => toggleSection("annotations")}
          >
            <AnnotationList key={activeNoteId} store={store} noteId={activeNoteId} />
          </InspectorSection>
        )}
        {activeNoteId && (
          <InspectorSection
            id="metadata-revisions"
            title="Revisions"
            open={openSections.revisions}
            onToggle={() => toggleSection("revisions")}
          >
            <RevisionList
              key={activeNoteId}
              store={store}
              noteId={activeNoteId}
              versions={versions}
              onOpen={(versionId) => {
                window.location.hash = noteHistoryHash(activeNoteId, versionId);
              }}
            />
          </InspectorSection>
        )}
        {activeNoteId && hasRelationships && (
          <InspectorSection
            id="metadata-relationships"
            title="Relationships"
            open={openSections.relationships}
            onToggle={() => toggleSection("relationships")}
          >
            <RelationshipExplorer store={store} noteId={activeNoteId} />
          </InspectorSection>
        )}
      </div>

      <div className="max-h-[55%] shrink-0 overflow-y-auto border-t border-border/60 bg-background">
        <InspectorSection
          id="metadata-details"
          title="Details"
          open={openSections.details}
          onToggle={() => toggleSection("details")}
          className="border-b-0"
        >
          <dl className="m-0 space-y-2.5">
            {detailRows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-[13px] text-muted-foreground">{row.label}</dt>
                <dd className="m-0 text-right text-[13px] font-medium tabular-nums text-foreground/80">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </InspectorSection>
      </div>
    </aside>
  );
}
