import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { cn } from "@/shared/lib/utils";
import { ChevronDownIcon, ChevronRightIcon } from "@/shared/icons/static";
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
import { noteHistoryHash } from "@/app-route";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { NoteOutline } from "./note-outline";
import { AnnotationList } from "./annotation-list";
import { RelationshipExplorer } from "@/features/references/relationship-explorer";
import { projectHasRelationships } from "@/features/references/relationship-model";
import type { RendererState, RendererStore } from "@/store/types";

type Props = {
  store: RendererStore;
};

type SectionKey =
  | "outline"
  | "annotations"
  | "revisions"
  | "details"
  | "relationships";

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

const quietActionClass =
  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap bg-transparent p-0 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground";

type RevisionRowsProps = {
  rows: readonly VersionRow[];
  label: string;
  onOpen: (versionId: string) => void;
  className?: string;
};

function RevisionRows({ rows, label, onOpen, className }: RevisionRowsProps) {
  return (
    <ul aria-label={label} className={cn("m-0 list-none p-0", className)}>
      {rows.map((row) =>
        row.kind === "group" ? (
          <li key={row.key} className={cn(sectionLabelClass, "px-2 pb-1 pt-2.5")}>
            {row.label}
          </li>
        ) : (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => onOpen(row.item.versionId)}
              title={formatVersionTimestamp(row.item.createdAt)}
              className="group/revision flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] bg-transparent px-2 py-1 text-left transition-colors hover:bg-muted"
            >
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors group-hover/revision:text-foreground">
                {formatVersionClock(row.item.createdAt)}
              </span>
              <VersionStats wordDelta={row.item.wordDelta} />
              <span className="shrink-0 text-[10px] text-muted-foreground/45 opacity-0 transition-opacity group-hover/revision:opacity-100">
                {formatRelativeTime(row.item.createdAt)}
              </span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
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
  versions: readonly VersionListItem[];
  onOpen: (versionId?: string) => void;
};

function RevisionList({ versions, onOpen }: RevisionListProps) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = versions.length - collapsedRevisionCount;
  const rows = useMemo(() => groupVersionRows(versions), [versions]);
  const splitIndex = useMemo(() => findRevisionSplit(rows, collapsedRevisionCount), [rows]);

  if (versions.length === 0) {
    return <p className="m-0 text-[13px] text-muted-foreground/70">No revisions yet</p>;
  }

  const tail = rows.slice(splitIndex);

  return (
    <div className="space-y-1.5">
      <div className="max-h-64 overflow-y-auto overscroll-contain">
        <RevisionRows
          rows={rows.slice(0, splitIndex)}
          label="Revisions"
          onOpen={onOpen}
          className="[&>li:first-child]:pt-0"
        />
        {tail.length > 0 && (
          <Collapse open={expanded}>
            <RevisionRows rows={tail} label="Older revisions" onOpen={onOpen} />
          </Collapse>
        )}
      </div>
      <div className="flex items-center gap-3 px-2 pt-1">
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className={quietActionClass}
          >
            <ChevronDownIcon
              size={10}
              className={cn(
                "transition-transform duration-150 motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
            />
            {expanded ? "Show less" : `${hiddenCount} more`}
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
  return state.activeNoteId === null
    ? null
    : (state.metadata.get(state.activeNoteId) ?? null);
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
            <div
              data-outline-scroll
              className="max-h-[38vh] overflow-y-auto overscroll-contain"
            >
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
