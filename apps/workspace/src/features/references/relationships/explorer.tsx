import { useCallback, useState } from "react";
import { openJournalDay } from "@/features/journal/navigation";
import { activateNote } from "@/features/notes/navigation";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { SectionChevron, SectionLabel } from "@/shared/ui/section-header";
import {
  projectCoVisitedRows,
  selectBacklinkRows,
  selectJournalRows,
  selectOutgoingRows,
  selectRelationshipGraph,
  selectSharedPersonRows,
  selectSharedTagRows,
  type DetailedNote,
  type RelationshipGraph,
} from "./model";
import { RelationshipGraphView } from "./graph";
import { UnlinkedMentions } from "../mentions/unlinked";

const ROWS = 5;

function sameRows<T extends { noteId: string; title: string; detail?: string }>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index]!;
      return (
        entry.noteId === other.noteId &&
        entry.title === other.title &&
        entry.detail === other.detail
      );
    })
  );
}

function sameGraph(left: RelationshipGraph, right: RelationshipGraph): boolean {
  return (
    left.hiddenCount === right.hiddenCount &&
    left.nodes.length === right.nodes.length &&
    left.edges.length === right.edges.length &&
    left.nodes.every((node, index) => {
      const other = right.nodes[index]!;
      return node.id === other.id && node.label === other.label && node.kind === other.kind;
    }) &&
    left.edges.every((edge, index) => {
      const other = right.edges[index]!;
      return edge.from === other.from && edge.to === other.to;
    })
  );
}

function RelationshipSection({
  title,
  entries,
  render,
}: {
  title: string;
  entries: readonly unknown[];
  render: (index: number) => React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const visible = all ? entries.length : Math.min(ROWS, entries.length);
  if (entries.length === 0) {
    return null;
  }
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-6 w-full cursor-pointer items-center gap-1.5 rounded px-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none"
      >
        <SectionChevron open={open} />
        <SectionLabel title={title} count={entries.length} />
      </button>
      {open && (
        <div className="pb-1.5 pt-0.5">
          <ul className="m-0 list-none space-y-0.5 p-0">
            {Array.from({ length: visible }, (_, index) => (
              <li key={index}>{render(index)}</li>
            ))}
          </ul>
          {entries.length > ROWS && (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll((value) => !value)}
              className="mt-1 cursor-pointer px-2 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              {all ? "Show less" : `Show all ${entries.length - ROWS} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function NoteRow({ entry, onOpen }: { entry: DetailedNote; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded px-2 py-1 text-left text-[13px] text-foreground/80 transition-colors hover:bg-muted/50 focus-visible:outline-none"
    >
      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
      {entry.detail && (
        <span className="shrink-0 truncate text-[11px] text-muted-foreground">{entry.detail}</span>
      )}
    </button>
  );
}

export function RelationshipExplorer({ store, noteId }: { store: RendererStore; noteId: string }) {
  const backlinks = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectBacklinkRows(state, noteId), [noteId]),
    sameRows,
  );
  const outgoing = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectOutgoingRows(state, noteId), [noteId]),
    sameRows,
  );
  const people = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectSharedPersonRows(state, noteId), [noteId]),
    sameRows,
  );
  const tags = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectSharedTagRows(state, noteId), [noteId]),
    sameRows,
  );
  const journal = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectJournalRows(state, noteId), [noteId]),
    sameRows,
  );
  const coVisited = useRendererSelector(
    store,
    useCallback((state: RendererState) => projectCoVisitedRows(state, noteId), [noteId]),
    sameRows,
  );
  const graph = useRendererSelector(
    store,
    useCallback((state: RendererState) => selectRelationshipGraph(state, noteId), [noteId]),
    sameGraph,
  );

  return (
    <div className="space-y-1">
      <RelationshipSection
        title="Referenced by"
        entries={backlinks}
        render={(index) => (
          <NoteRow
            entry={backlinks[index]!}
            onOpen={() => activateNote(store, backlinks[index]!.noteId)}
          />
        )}
      />
      <UnlinkedMentions store={store} noteId={noteId} />
      <RelationshipSection
        title="Links to"
        entries={outgoing}
        render={(index) => (
          <NoteRow
            entry={outgoing[index]!}
            onOpen={() => activateNote(store, outgoing[index]!.noteId)}
          />
        )}
      />
      <RelationshipSection
        title="Shared people"
        entries={people}
        render={(index) => (
          <NoteRow
            entry={people[index]!}
            onOpen={() => activateNote(store, people[index]!.noteId)}
          />
        )}
      />
      <RelationshipSection
        title="Shared tags"
        entries={tags}
        render={(index) => (
          <NoteRow entry={tags[index]!} onOpen={() => activateNote(store, tags[index]!.noteId)} />
        )}
      />
      <RelationshipSection
        title="Journal"
        entries={journal}
        render={(index) => {
          const entry = journal[index]!;
          return (
            <NoteRow
              entry={entry}
              onOpen={() => openJournalDay(entry.dateKey as Parameters<typeof openJournalDay>[0])}
            />
          );
        }}
      />
      <RelationshipSection
        title="Viewed together"
        entries={coVisited}
        render={(index) => (
          <NoteRow
            entry={coVisited[index]!}
            onOpen={() => activateNote(store, coVisited[index]!.noteId)}
          />
        )}
      />
      <RelationshipGraphView store={store} graph={graph} />
    </div>
  );
}
