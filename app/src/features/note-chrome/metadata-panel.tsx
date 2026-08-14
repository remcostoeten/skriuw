import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { cn } from "@/shared/lib/utils";
import { SectionChevron, SectionLabel, sectionHeaderClass } from "@/shared/ui/section-header";
import { projectVersionList, type VersionListItem } from "@/features/history/version-model";
import { noteHistoryHash } from "@/app-route";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { NoteOutline } from "./note-outline";
import {
  BacklinksList,
  OutgoingNotesList,
  ReferenceDetailLists,
  useBacklinks,
  useNoteReferenceDetails,
  useOutgoingNotes,
} from "@/features/references/reference-panel";
import type { RendererState, RendererStore } from "@/store/types";

type Props = {
  store: RendererStore;
};

type SectionKey =
  | "outline"
  | "revisions"
  | "details"
  | "backlinks"
  | "outgoing"
  | "references";

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
  return (
    <section aria-labelledby={id} className={cn("border-b border-border/60", className)}>
      <button
        type="button"
        id={id}
        onClick={onToggle}
        aria-expanded={open}
        className={cn(sectionHeaderClass, "sticky top-0 z-[1] bg-background")}
      >
        <SectionChevron open={open} />
        <SectionLabel title={title} />
      </button>
      {open || keepMounted ? (
        <div className={cn("px-4 pb-2.5", !open && "hidden")}>{children}</div>
      ) : null}
    </section>
  );
}

const asideClass = "flex h-full min-h-0 w-full flex-col border-l border-border bg-background";

const OPEN_STORAGE_KEY = "skriuw.inspector-sections-open";

const defaultOpenSections: Record<SectionKey, boolean> = {
  outline: true,
  revisions: true,
  details: true,
  backlinks: true,
  outgoing: true,
  references: true,
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
  "cursor-pointer bg-transparent p-0 text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground";

type RevisionListProps = {
  versions: readonly VersionListItem[];
  onOpen: (versionId?: string) => void;
};

function RevisionList({ versions, onOpen }: RevisionListProps) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = versions.length - collapsedRevisionCount;
  const visible = expanded ? versions : versions.slice(0, collapsedRevisionCount);

  if (versions.length === 0) {
    return <p className="m-0 text-[13px] text-muted-foreground/70">No revisions yet</p>;
  }

  return (
    <div className="space-y-1.5">
      <ul
        className={cn(
          "m-0 list-none space-y-0.5 p-0",
          expanded && "max-h-64 overflow-y-auto overscroll-contain",
        )}
      >
        {visible.map((version) => (
          <li key={version.versionId}>
            <button
              type="button"
              onClick={() => onOpen(version.versionId)}
              className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-[var(--radius)] bg-transparent px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className="truncate">{version.summary}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground/60">
                {formatRelativeTime(version.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 px-2 pt-0.5">
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className={quietActionClass}
          >
            {expanded ? "Show less" : `Show ${hiddenCount} more`}
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => onOpen()} className={quietActionClass}>
          Open history
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
  const backlinks = useBacklinks(store, activeNoteId);
  const outgoingNotes = useOutgoingNotes(store, activeNoteId);
  const referenceDetails = useNoteReferenceDetails(store, activeNoteId);
  const createdAt = useRendererSelector(store, selectActiveNoteCreatedAt);
  const markdown = useRendererSelector(store, selectActiveNoteMarkdown);
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
        {activeNoteId && backlinks.length > 0 && (
          <InspectorSection
            id="metadata-backlinks"
            title="Backlinks"
            open={openSections.backlinks}
            onToggle={() => toggleSection("backlinks")}
          >
            <BacklinksList store={store} entries={backlinks} />
          </InspectorSection>
        )}
        {activeNoteId && outgoingNotes.length > 0 && (
          <InspectorSection
            id="metadata-outgoing"
            title="Links to"
            open={openSections.outgoing}
            onToggle={() => toggleSection("outgoing")}
          >
            <OutgoingNotesList store={store} entries={outgoingNotes} />
          </InspectorSection>
        )}
        {activeNoteId && referenceDetails.length > 0 && (
          <InspectorSection
            id="metadata-references"
            title="Tags & people"
            open={openSections.references}
            onToggle={() => toggleSection("references")}
          >
            <ReferenceDetailLists store={store} details={referenceDetails} />
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
