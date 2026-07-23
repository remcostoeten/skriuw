import { useCallback, useState } from "react";
import { activateNote } from "../actions/workspace";
import { cn } from "../shared/lib/utils";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";
import {
  backlinksEqual,
  projectBacklinks,
  projectNoteReferenceDetails,
  projectReferencingNotes,
  referenceDetailsEqual,
  type BacklinkEntry,
  type ReferenceDetailEntry,
} from "./reference-panel-model";

const noEntries: BacklinkEntry[] = [];
const noDetails: ReferenceDetailEntry[] = [];

export function useBacklinks(
  store: RendererStore,
  noteId: string | null,
): readonly BacklinkEntry[] {
  const selector = useCallback(
    (state: RendererState) => (noteId === null ? noEntries : projectBacklinks(state, noteId)),
    [noteId],
  );
  return useRendererSelector(store, selector, backlinksEqual);
}

export function useNoteReferenceDetails(
  store: RendererStore,
  noteId: string | null,
): readonly ReferenceDetailEntry[] {
  const selector = useCallback(
    (state: RendererState) =>
      noteId === null ? noDetails : projectNoteReferenceDetails(state, noteId),
    [noteId],
  );
  return useRendererSelector(store, selector, referenceDetailsEqual);
}

type NoteListProps = {
  entries: readonly BacklinkEntry[];
  emptyLabel: string;
  onOpenNote: (noteId: string) => void;
};

function NoteList({ entries, emptyLabel, onOpenNote }: NoteListProps) {
  if (entries.length === 0) {
    return <p className="m-0 text-[13px] text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {entries.map((entry) => (
        <li key={entry.noteId}>
          <button
            type="button"
            className="w-full cursor-pointer truncate rounded px-2 py-1 text-left text-[13px] text-foreground/80 transition-colors hover:bg-muted/50"
            onClick={() => onOpenNote(entry.noteId)}
          >
            {entry.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

type BacklinksListProps = {
  store: RendererStore;
  entries: readonly BacklinkEntry[];
};

export function BacklinksList({ store, entries }: BacklinksListProps) {
  return (
    <NoteList
      entries={entries}
      emptyLabel="No notes mention this note."
      onOpenNote={(id) => activateNote(store, id)}
    />
  );
}

type DetailRowProps = {
  store: RendererStore;
  entry: ReferenceDetailEntry;
};

function ReferenceDetailRow({ store, entry }: DetailRowProps) {
  const [open, setOpen] = useState(false);
  const selector = useCallback(
    (state: RendererState) =>
      open ? projectReferencingNotes(state, entry.kind, entry.id) : noEntries,
    [entry.id, entry.kind, open],
  );
  const notes = useRendererSelector(store, selector, backlinksEqual);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded px-2 py-1 text-left text-[13px] transition-colors hover:bg-muted/50"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={cn("truncate", entry.kind === "tag" && "text-primary")}>
          {entry.kind === "tag" ? `#${entry.name}` : `@${entry.name}`}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground/60">{entry.noteCount}</span>
      </button>
      {open && (
        <div className="pl-3 pt-1">
          <NoteList
            entries={notes}
            emptyLabel="No referencing notes."
            onOpenNote={(id) => activateNote(store, id)}
          />
        </div>
      )}
    </li>
  );
}

type DetailListProps = {
  store: RendererStore;
  details: readonly ReferenceDetailEntry[];
};

export function ReferenceDetailLists({ store, details }: DetailListProps) {
  if (details.length === 0) {
    return <p className="m-0 text-[13px] text-muted-foreground">No tags or people yet.</p>;
  }
  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {details.map((entry) => (
        <ReferenceDetailRow key={`${entry.kind}:${entry.id}`} store={store} entry={entry} />
      ))}
    </ul>
  );
}
