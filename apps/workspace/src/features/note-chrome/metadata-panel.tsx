import { memo, useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { ChevronRightIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { projectVersionList } from "@/features/history/versions";
import { noteHistoryHash } from "@skriuw/renderer-core/route/app-route";
import {
  noteUnlinkedMentionTerm,
  RelationshipExplorer,
  selectHasRelationships,
} from "@/features/references/shell";
import { openedFileOrigin } from "@/features/transfer/opened-file-origin";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { NoteOutline } from "./metadata/outline";
import { AnnotationList } from "./metadata/annotation-list";
import { DetailsList } from "./metadata/details-list";
import { RevisionList } from "./metadata/revision-list";
import { inspectorQuietAction } from "./metadata/inspector-classes";
import { InspectorIndex } from "./metadata/inspector-index";
import { inspectorKeyDown } from "./metadata/inspector-keys";
import {
  readingMinutes,
  visibleInspectorSections,
  type InspectorSection as SectionId,
} from "./metadata/inspector-model";
import { InspectorSection, inspectorHeadingId } from "./metadata/inspector-section";
import { INSPECTOR_INDEX_HEIGHT, useInspectorSpy } from "./metadata/use-inspector-spy";

type Props = {
  store: RendererStore;
};

const asideClass = "flex h-full min-h-0 w-full flex-col border-l border-border bg-background";

const OPEN_STORAGE_KEY = "skriuw.inspector-sections-open";

const defaultOpenSections: Record<SectionId, boolean> = {
  outline: true,
  comments: true,
  revisions: true,
  relationships: true,
  details: true,
};

function readOpenSections(): Record<SectionId, boolean> {
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
    for (const key of Object.keys(next) as SectionId[]) {
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

function writeOpenSections(sections: Record<SectionId, boolean>): void {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(sections));
  } catch {
    return;
  }
}

function selectActiveNoteId(state: RendererState): string | null {
  return state.activeNoteId;
}

function selectNoteMetadata(state: RendererState, noteId: string | null) {
  return noteId === null ? null : (state.metadata.get(noteId) ?? null);
}

function selectNoteHistory(state: RendererState, noteId: string | null) {
  return noteId === null ? null : (state.historyHeaders.get(noteId) ?? null);
}

function selectNoteCreatedAt(state: RendererState, noteId: string | null): number | null {
  return noteId === null ? null : (state.sourceNodes.get(noteId)?.createdAt ?? null);
}

function selectNoteMarkdown(state: RendererState, noteId: string | null): string | null {
  return noteId === null ? null : (state.documents.get(noteId)?.markdown ?? null);
}

type AnnotationTotals = { total: number; open: number };

const annotationTotals = new WeakMap<RendererState["annotations"], Map<string, AnnotationTotals>>();

function annotationTotalsFor(state: RendererState, noteId: string): AnnotationTotals {
  let totals = annotationTotals.get(state.annotations);
  if (!totals) {
    totals = new Map();
    for (const annotation of state.annotations.values()) {
      const entry = totals.get(annotation.noteId) ?? { total: 0, open: 0 };
      entry.total += 1;
      if (annotation.status === "open") {
        entry.open += 1;
      }
      totals.set(annotation.noteId, entry);
    }
    annotationTotals.set(state.annotations, totals);
  }
  return totals.get(noteId) ?? { total: 0, open: 0 };
}

function selectNoteOrigin(state: RendererState, noteId: string | null): string | null {
  return noteId === null ? null : openedFileOrigin(state.importReceipts, noteId);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const MetadataPanel = memo(function MetadataPanel({ store }: Props) {
  const activeNoteId = useRendererSelector(store, selectActiveNoteId);
  const noteId = useDeferredValue(activeNoteId);
  return <MetadataPanelContent store={store} activeNoteId={noteId} />;
});

type ContentProps = {
  store: RendererStore;
  activeNoteId: string | null;
};

const MetadataPanelContent = memo(function MetadataPanelContent({
  store,
  activeNoteId,
}: ContentProps) {
  const metadata = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectNoteMetadata(state, activeNoteId), [activeNoteId]),
  );
  const historyHeaders = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectNoteHistory(state, activeNoteId), [activeNoteId]),
  );
  const versions = useMemo(() => projectVersionList(historyHeaders), [historyHeaders]);
  const createdAt = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectNoteCreatedAt(state, activeNoteId), [activeNoteId]),
  );
  const markdown = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectNoteMarkdown(state, activeNoteId), [activeNoteId]),
  );
  const originPath = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectNoteOrigin(state, activeNoteId), [activeNoteId]),
  );
  const hasRelationships = useRendererSelector(
    store,
    useCallback(
      (state: RendererState) =>
        activeNoteId !== null &&
        (noteUnlinkedMentionTerm(state, activeNoteId) !== null ||
          selectHasRelationships(state, activeNoteId)),
      [activeNoteId],
    ),
  );
  const commentTotal = useRendererSelector(
    store,
    useCallback(
      (state: RendererState) =>
        activeNoteId === null ? 0 : annotationTotalsFor(state, activeNoteId).total,
      [activeNoteId],
    ),
  );
  const commentsOpen = useRendererSelector(
    store,
    useCallback(
      (state: RendererState) =>
        activeNoteId === null ? 0 : annotationTotalsFor(state, activeNoteId).open,
      [activeNoteId],
    ),
  );
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(readOpenSections);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [outlineCount, setOutlineCount] = useState(0);
  const handleOutlineCountChange = useCallback((count: number) => setOutlineCount(count), []);

  const visible = useMemo(
    () =>
      visibleInspectorSections({
        outline: outlineCount > 1,
        comments: commentTotal > 0,
        relationships: hasRelationships,
      }),
    [outlineCount, commentTotal, hasRelationships],
  );
  const spy = useInspectorSpy(scrollRef, visible);

  function toggleSection(section: SectionId): void {
    setOpenSections((current) => {
      const next = { ...current, [section]: !current[section] };
      writeOpenSections(next);
      return next;
    });
  }

  function jumpToSection(section: SectionId): void {
    const scroller = scrollRef.current;
    const element = scroller?.querySelector<HTMLElement>(`[data-inspector-section="${section}"]`);
    if (!scroller || !element) {
      return;
    }
    if (!openSections[section]) {
      toggleSection(section);
    }
    const top =
      element.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      INSPECTOR_INDEX_HEIGHT;
    spy.pin(section);
    scroller.scrollTo({
      top: Math.max(0, top),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    document.getElementById(inspectorHeadingId(section))?.focus({ preventScroll: true });
  }

  if (!metadata) {
    return <aside className={asideClass} aria-label="Note metadata" />;
  }

  const counts: Record<SectionId, number | null> = {
    outline: outlineCount,
    comments: commentsOpen,
    revisions: versions.length,
    relationships: null,
    details: null,
  };

  return (
    <aside
      className={asideClass}
      aria-label="Note metadata"
      onKeyDown={(event) => inspectorKeyDown(event, visible, jumpToSection)}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <InspectorIndex
          sections={visible}
          counts={counts}
          current={spy.current}
          scrolled={spy.scrolled}
          onJump={jumpToSection}
        />
        <p className="m-0 px-4 pb-3 pt-1.5 text-[12.5px] tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">{metadata.wordCount.toLocaleString()}</span>{" "}
          {metadata.wordCount === 1 ? "word" : "words"} · {readingMinutes(metadata.wordCount)} min
          read
        </p>
        {activeNoteId && (
          <InspectorSection
            section="outline"
            title="Outline"
            count={outlineCount}
            open={openSections.outline}
            onToggle={() => toggleSection("outline")}
            hidden={outlineCount <= 1}
            keepMounted
          >
            <div data-outline-scroll className="max-h-[38dvh] overflow-y-auto overscroll-contain">
              <NoteOutline
                store={store}
                noteId={activeNoteId}
                onCountChange={handleOutlineCountChange}
              />
            </div>
          </InspectorSection>
        )}
        {activeNoteId && commentTotal > 0 && (
          <InspectorSection
            section="comments"
            title="Comments"
            count={commentsOpen}
            open={openSections.comments}
            onToggle={() => toggleSection("comments")}
          >
            <AnnotationList store={store} noteId={activeNoteId} />
          </InspectorSection>
        )}
        {activeNoteId && (
          <InspectorSection
            section="revisions"
            title="Revisions"
            count={versions.length}
            open={openSections.revisions}
            onToggle={() => toggleSection("revisions")}
            action={
              <button
                type="button"
                onClick={() => {
                  window.location.hash = noteHistoryHash(activeNoteId);
                }}
                className={cn(inspectorQuietAction, "group/open shrink-0")}
              >
                Open history
                <ChevronRightIcon
                  size={10}
                  className="-mr-0.5 transition-transform duration-150 group-hover/open:translate-x-0.5 motion-reduce:transition-none"
                />
              </button>
            }
          >
            <RevisionList
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
            section="relationships"
            title="Relationships"
            open={openSections.relationships}
            onToggle={() => toggleSection("relationships")}
          >
            <RelationshipExplorer store={store} noteId={activeNoteId} />
          </InspectorSection>
        )}
        <InspectorSection
          section="details"
          title="Details"
          open={openSections.details}
          onToggle={() => toggleSection("details")}
        >
          <DetailsList
            wordCount={metadata.wordCount}
            markdown={markdown}
            createdAt={createdAt}
            updatedAt={metadata.updatedAt}
            originPath={originPath}
          />
        </InspectorSection>
      </div>
    </aside>
  );
});
