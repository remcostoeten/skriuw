import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRendererSelector } from "../store/use-renderer-selector";
import { ChevronRightIcon, HistoryIcon, InfoIcon, ListIcon } from "../shared/icons";
import { cn } from "../shared/lib/utils";
import { projectVersionList } from "../history/version-model";
import { VersionHistoryPanel } from "../history/version-history-panel";
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
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

type SectionKey =
  | "outline"
  | "history"
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
  return (
    <section aria-labelledby={id} className={cn("border-b border-border", className)}>
      <button
        type="button"
        id={id}
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/68">
          {icon}
          <span className="truncate">{title}</span>
          {count !== undefined && (
            <span className="font-normal tabular-nums text-muted-foreground/44">({count})</span>
          )}
        </div>
        <ChevronRightIcon
          size={14}
          className={cn(
            "shrink-0 text-muted-foreground/50 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

const asideClass = "flex h-full min-h-0 w-full flex-col border-l border-border bg-background";

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

export function MetadataPanel({ store }: Props) {
  const activeNoteId = useRendererSelector(store, (state) => state.activeNoteId);
  const metadata = useRendererSelector(store, (state) =>
    state.activeNoteId === null ? null : (state.metadata.get(state.activeNoteId) ?? null),
  );
  const historyHeaders = useRendererSelector(store, (state) =>
    state.activeNoteId === null ? null : (state.historyHeaders.get(state.activeNoteId) ?? null),
  );
  const versions = useMemo(() => projectVersionList(historyHeaders), [historyHeaders]);
  const backlinks = useBacklinks(store, activeNoteId);
  const outgoingNotes = useOutgoingNotes(store, activeNoteId);
  const referenceDetails = useNoteReferenceDetails(store, activeNoteId);
  const unlinkedMentions = useUnlinkedMentions(store, activeNoteId);
  const createdAt = useRendererSelector(store, (state) =>
    state.activeNoteId === null ? null : (state.sourceNodes.get(state.activeNoteId)?.createdAt ?? null),
  );
  const markdown = useRendererSelector(store, (state) =>
    state.activeNoteId === null ? null : (state.documents.get(state.activeNoteId)?.markdown ?? null),
  );
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    outline: true,
    history: true,
    details: true,
    backlinks: true,
    outgoing: true,
    references: true,
    mentions: true,
  });
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
        {versions.length > 0 && activeNoteId && (
          <InspectorSection
            id="metadata-history"
            title="History"
            icon={<HistoryIcon size={14} className="shrink-0" />}
            count={versions.length}
            open={openSections.history}
            onToggle={() => toggleSection("history")}
          >
            <VersionHistoryPanel
              key={activeNoteId}
              store={store}
              noteId={activeNoteId}
              versions={versions}
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

      <div className="shrink-0 border-t border-border bg-background">
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
