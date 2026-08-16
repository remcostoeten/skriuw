import { useCallback, useState } from "react";
import { formatListDate } from "@/features/journal/dates";
import { openJournalDay } from "@/features/journal/navigation";
import { activateNote } from "@/store/actions/workspace";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import { SectionToggle } from "@/shared/ui/section-header";
import { projectBacklinks, projectOutgoingNotes, type BacklinkEntry } from "./reference-panel-model";
import {
  projectCoVisitedNotes,
  projectRelatedJournalEntries,
  projectRelationshipGraph,
  projectSharedEntities,
  type RelationshipGraph,
  type RelationshipNote,
} from "./relationship-model";
import { RelationshipGraphView } from "./relationship-graph";

const ROWS = 5;

type DetailedNote = {
  noteId: string;
  title: string;
  detail: string;
};

type JournalRow = DetailedNote & {
  dateKey: string;
};

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

function entityLabels(
  state: RendererState,
  ids: readonly string[],
  kind: "person" | "tag",
): string {
  const prefix = kind === "person" ? "$" : "#";
  return ids
    .map((id) => (kind === "person" ? state.people.get(id)?.name : state.tags.get(id)?.name))
    .filter((name): name is string => name !== undefined)
    .map((name) => `${prefix}${name}`)
    .join(" · ");
}

function projectSharedEntityRows(
  state: RendererState,
  noteId: string,
  kind: "person" | "tag",
): DetailedNote[] {
  return projectSharedEntities(state, noteId, kind).map((entry) => ({
    noteId: entry.noteId,
    title: entry.title,
    detail: entityLabels(state, entry.sharedEntityIds, kind),
  }));
}

function journalDetail(
  state: RendererState,
  entry: ReturnType<typeof projectRelatedJournalEntries>[number],
): string {
  if (entry.directIncoming) {
    return "Mentioned this note";
  }
  if (entry.directOutgoing) {
    return "Linked from this note";
  }
  return [
    entityLabels(state, entry.sharedPersonIds, "person"),
    entityLabels(state, entry.sharedTagIds, "tag"),
  ]
    .filter(Boolean)
    .join(" · ");
}

function projectJournalRows(state: RendererState, noteId: string): JournalRow[] {
  return projectRelatedJournalEntries(state, noteId).map((entry) => ({
    noteId: entry.noteId,
    title: formatListDate(entry.dateKey),
    detail: journalDetail(state, entry),
    dateKey: entry.dateKey,
  }));
}

function toRows(entries: readonly (BacklinkEntry | RelationshipNote)[]): DetailedNote[] {
  return entries.map((entry) => ({ noteId: entry.noteId, title: entry.title, detail: "" }));
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
    <section className="group relative border-b border-border/60">
      <SectionToggle
        id={`relationships-${title}`}
        title={`${title} (${entries.length})`}
        open={open}
        onToggle={() => setOpen((value) => !value)}
      />
      {open && (
        <div className="px-4 pb-2.5 pt-2.5">
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
              className="mt-2 cursor-pointer px-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {all ? "Show less" : `Show all ${entries.length - ROWS} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function NoteRow({
  entry,
  onOpen,
}: {
  entry: DetailedNote;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded px-2 py-1 text-left text-[13px] text-foreground/80 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    useCallback((state: RendererState) => toRows(projectBacklinks(state, noteId)), [noteId]),
    sameRows,
  );
  const outgoing = useRendererSelector(
    store,
    useCallback((state: RendererState) => toRows(projectOutgoingNotes(state, noteId)), [noteId]),
    sameRows,
  );
  const people = useRendererSelector(
    store,
    useCallback(
      (state: RendererState) => projectSharedEntityRows(state, noteId, "person"),
      [noteId],
    ),
    sameRows,
  );
  const tags = useRendererSelector(
    store,
    useCallback((state: RendererState) => projectSharedEntityRows(state, noteId, "tag"), [noteId]),
    sameRows,
  );
  const journal = useRendererSelector(
    store,
    useCallback((state: RendererState) => projectJournalRows(state, noteId), [noteId]),
    sameRows,
  );
  const coVisited = useRendererSelector(
    store,
    useCallback((state: RendererState) => toRows(projectCoVisitedNotes(state, noteId)), [noteId]),
    sameRows,
  );
  const graph = useRendererSelector(
    store,
    useCallback((state: RendererState) => projectRelationshipGraph(state, noteId), [noteId]),
    sameGraph,
  );

  return (
    <div>
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
              onOpen={() =>
                openJournalDay(entry.dateKey as Parameters<typeof openJournalDay>[0])
              }
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
