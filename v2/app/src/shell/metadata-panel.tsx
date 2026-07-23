import { useMemo, useState, type ReactNode } from "react";
import { useRendererSelector } from "../store/use-renderer-selector";
import { ChevronRightIcon, HistoryIcon, InfoIcon } from "../shared/icons";
import { cn } from "../shared/lib/utils";
import { projectVersionList } from "../history/version-model";
import { VersionHistoryPanel } from "../history/version-history-panel";
import {
  BacklinksList,
  ReferenceDetailLists,
  useBacklinks,
  useNoteReferenceDetails,
} from "../references/reference-panel";
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

type SectionKey = "history" | "details" | "backlinks" | "references";

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
  const referenceDetails = useNoteReferenceDetails(store, activeNoteId);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    history: true,
    details: true,
    backlinks: true,
    references: true,
  });

  function toggleSection(section: SectionKey): void {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  if (!metadata) {
    return <aside className={asideClass} aria-label="Note metadata" />;
  }

  return (
    <aside className={asideClass} aria-label="Note metadata">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
        {activeNoteId && (
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
        {activeNoteId && (
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
      </div>

      <div className="shrink-0 border-t border-border bg-background">
        <InspectorSection
          id="metadata-details"
          title="Details"
          icon={<InfoIcon size={14} className="shrink-0" />}
          count={2}
          open={openSections.details}
          onToggle={() => toggleSection("details")}
          className="border-b-0"
        >
          <dl className="m-0 space-y-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-muted-foreground">Words</dt>
              <dd className="m-0 text-[13px] font-medium tabular-nums text-foreground/80">
                {metadata.wordCount}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-muted-foreground">Updated</dt>
              <dd className="m-0 text-[13px] font-medium tabular-nums text-foreground/80">
                {new Date(metadata.updatedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </InspectorSection>
      </div>
    </aside>
  );
}
