import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useRendererSelector } from "../store/use-renderer-selector";
import { ChevronRightIcon, HistoryIcon, InfoIcon, ListIcon } from "../shared/icons";
import { cn } from "../shared/lib/utils";
import { projectVersionList, type VersionListItem } from "../history/version-model";
import { noteHistoryHash } from "../app-route";
import { formatRelativeTime } from "../shared/lib/relative-time";
import { NoteOutline } from "./note-outline";
import {
  BacklinksList,
  OutgoingNotesList,
  ReferenceDetailLists,
  UnlinkedMentionsList,
  useBacklinks,
  useNoteReferenceDetails,
  useOutgoingNotes,
  useUnlinkedMentions,
} from "../references/reference-panel";
import type { RendererState, RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

type SectionKey =
  | "outline"
  | "revisions"
  | "details"
  | "backlinks"
  | "outgoing"
  | "references"
  | "mentions";

type SectionProps = {
  id: string;
  title: string;
  icon: ReactNode;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
};

const sectionHeaderClass =
  "sticky top-0 z-[1] flex min-h-11 w-full items-center justify-between gap-3 bg-background px-4 py-2 text-left";

const sectionLabelClass =
  "flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/68";

function InspectorSection({
  id,
  title,
  icon,
  count,
  open,
  onToggle,
  children,
  className,
}: SectionProps) {
  const label = (
    <div className={sectionLabelClass}>
      {icon}
      <span className="truncate">{title}</span>
      {count !== undefined && (
        <span className="font-normal tabular-nums text-muted-foreground/44">({count})</span>
      )}
    </div>
  );

  return (
    <section aria-labelledby={id} className={cn("border-b border-border", className)}>
      {count === 0 ? (
        <div id={id} className={cn(sectionHeaderClass, "select-none")}>
          {label}
        </div>
      ) : (
        <button
          type="button"
          id={id}
          onClick={onToggle}
          aria-expanded={open}
          className={cn(sectionHeaderClass, "cursor-pointer transition-colors hover:bg-muted/50")}
        >
          {label}
          <ChevronRightIcon
            size={14}
            className={cn(
              "shrink-0 text-muted-foreground/50 transition-transform",
              open && "rotate-90",
            )}
          />
        </button>
      )}
      {(open || count === 0) && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

const asideClass = "flex h-full min-h-0 w-full flex-col border-l border-border bg-background";

const collapsedRevisionCount = 6;

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
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="w-full cursor-pointer rounded-[var(--radius)] bg-transparent px-2 py-1 text-left text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen()}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-border bg-transparent px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <HistoryIcon size={14} className="shrink-0" />
        <span className="truncate">Open history</span>
      </button>
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
  const unlinkedMentions = useUnlinkedMentions(store, activeNoteId);
  const createdAt = useRendererSelector(store, selectActiveNoteCreatedAt);
  const markdown = useRendererSelector(store, selectActiveNoteMarkdown);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    outline: true,
    revisions: true,
    details: true,
    backlinks: true,
    outgoing: true,
    references: true,
    mentions: true,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [outlineCount, setOutlineCount] = useState(0);
  const handleOutlineCountChange = useCallback((count: number) => setOutlineCount(count), []);

  function toggleSection(section: SectionKey): void {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
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
            icon={<ListIcon size={14} className="shrink-0" />}
            count={outlineCount}
            open={openSections.outline}
            onToggle={() => toggleSection("outline")}
          >
            <NoteOutline key={activeNoteId} store={store} onCountChange={handleOutlineCountChange} />
          </InspectorSection>
        )}
        {activeNoteId && (
          <InspectorSection
            id="metadata-revisions"
            title="Revisions"
            icon={<HistoryIcon size={14} className="shrink-0" />}
            count={versions.length}
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
            title="Linked mentions"
            icon={<InfoIcon size={14} className="shrink-0" />}
            count={backlinks.length}
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
            icon={<InfoIcon size={14} className="shrink-0" />}
            count={outgoingNotes.length}
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
            icon={<InfoIcon size={14} className="shrink-0" />}
            count={referenceDetails.length}
            open={openSections.references}
            onToggle={() => toggleSection("references")}
          >
            <ReferenceDetailLists store={store} details={referenceDetails} />
          </InspectorSection>
        )}
        {activeNoteId && unlinkedMentions.length > 0 && (
          <InspectorSection
            id="metadata-mentions"
            title="Unlinked mentions"
            icon={<InfoIcon size={14} className="shrink-0" />}
            count={unlinkedMentions.length}
            open={openSections.mentions}
            onToggle={() => toggleSection("mentions")}
          >
            <UnlinkedMentionsList store={store} entries={unlinkedMentions} />
          </InspectorSection>
        )}
      </div>

      <div className="max-h-[55%] shrink-0 overflow-y-auto border-t border-border bg-background">
        <InspectorSection
          id="metadata-details"
          title="Details"
          icon={<InfoIcon size={14} className="shrink-0" />}
          count={detailRows.length}
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
