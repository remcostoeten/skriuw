import { useCallback, useState } from "react";
import { activateNote, commitReferenceOperations } from "@/store/actions/workspace";
import { PencilIcon, Trash2Icon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";
import { ColorSwatchRow } from "./color-swatch-row";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { InlineEdit } from "@/shared/ui/inline-edit";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import {
  backlinksEqual,
  buildDeleteReferenceOperation,
  buildRecolorReferenceOperation,
  buildRenameReferenceOperation,
  projectBacklinks,
  projectNoteReferenceDetails,
  projectOutgoingNotes,
  projectReferencingNotes,
  referenceDetailsEqual,
  type BacklinkEntry,
  type ReferenceDetailEntry,
} from "./reference-panel-model";
import type { ReferenceOperation } from "./types";

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

export function useOutgoingNotes(
  store: RendererStore,
  noteId: string | null,
): readonly BacklinkEntry[] {
  const selector = useCallback(
    (state: RendererState) => (noteId === null ? noEntries : projectOutgoingNotes(state, noteId)),
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
      emptyLabel="No notes link to this note."
      onOpenNote={(id) => activateNote(store, id)}
    />
  );
}

export function OutgoingNotesList({ store, entries }: BacklinksListProps) {
  return (
    <NoteList
      entries={entries}
      emptyLabel="This note doesn't link to any other notes."
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
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const selector = useCallback(
    (state: RendererState) =>
      open ? projectReferencingNotes(state, entry.kind, entry.id) : noEntries,
    [entry.id, entry.kind, open],
  );
  const notes = useRendererSelector(store, selector, backlinksEqual);
  const sigil = entry.kind === "tag" ? "#" : "$";
  const noun = entry.kind === "tag" ? "Tag" : "Person";

  function commit(operation: ReferenceOperation | null): void {
    if (operation) {
      commitReferenceOperations(store, [operation]);
    }
  }

  function submitRename(value: string): void {
    commit(buildRenameReferenceOperation(entry, value));
    setRenaming(false);
  }

  function recolor(color: string | null): void {
    commit(buildRecolorReferenceOperation(entry, color));
    setPicking(false);
  }

  return (
    <li>
      <div className="group flex items-center gap-1 rounded-md px-1 transition-colors duration-100 hover:bg-muted/30 focus-within:bg-muted/30">
        <button
          type="button"
          aria-label={`Recolor ${noun.toLowerCase()} ${entry.name}`}
          aria-expanded={picking}
          className="flex size-5 shrink-0 items-center justify-center rounded"
          onClick={() => setPicking((value) => !value)}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-3 rounded-full",
              entry.color ? "border border-black/10" : "border border-dashed border-muted-foreground/50",
            )}
            style={entry.color ? { backgroundColor: entry.color } : undefined}
          />
        </button>
        {renaming ? (
          <InlineEdit
            defaultValue={entry.name}
            ariaLabel={`Rename ${noun.toLowerCase()} ${entry.name}`}
            onSubmit={submitRename}
            onCancel={() => setRenaming(false)}
            className="gap-0 px-0 py-0"
            inputClassName="ml-0 py-0.5"
          />
        ) : (
          <button
            type="button"
            aria-expanded={open}
            className="flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-3 py-1 text-left text-[13px]"
            onClick={() => setOpen((value) => !value)}
          >
            <span className={cn("truncate", entry.kind === "tag" && "text-reference-tag")}>
              {`${sigil}${entry.name}`}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground/60 transition-opacity duration-100 group-hover:opacity-0 group-focus-within:opacity-0 group-focus-within:transition-none">
              {entry.noteCount}
            </span>
          </button>
        )}
        {!renaming && (
          <InlineConfirm
            size="sm"
            confirmLabel="Delete"
            onConfirm={() => commit(buildDeleteReferenceOperation(entry))}
            className="shrink-0"
            renderIdle={(arm) => (
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 group-focus-within:transition-none">
                <button
                  type="button"
                  aria-label={`Rename ${noun.toLowerCase()} ${entry.name}`}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  onClick={() => setRenaming(true)}
                >
                  <PencilIcon size={12} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${noun.toLowerCase()} ${entry.name}`}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                  onClick={arm}
                >
                  <Trash2Icon size={12} />
                </button>
              </span>
            )}
          />
        )}
      </div>
      {picking && (
        <ColorSwatchRow
          className="mx-2 mt-1.5"
          label={`Color for ${entry.name}`}
          value={entry.color}
          onChange={recolor}
        />
      )}
      {open && !renaming && (
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
