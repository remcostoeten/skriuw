import { useCallback, useState } from "react";
import { activateNote, commitReferenceOperations } from "../actions/workspace";
import { CheckIcon, CloseIcon, PencilIcon, Trash2Icon } from "../shared/icons";
import { cn } from "../shared/lib/utils";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";
import {
  backlinksEqual,
  buildDeleteReferenceOperation,
  buildRecolorReferenceOperation,
  buildRenameReferenceOperation,
  projectBacklinks,
  projectNoteReferenceDetails,
  projectReferencingNotes,
  referenceColorSwatches,
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
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const selector = useCallback(
    (state: RendererState) =>
      open ? projectReferencingNotes(state, entry.kind, entry.id) : noEntries,
    [entry.id, entry.kind, open],
  );
  const notes = useRendererSelector(store, selector, backlinksEqual);
  const sigil = entry.kind === "tag" ? "#" : "@";
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
      <div className="group flex items-center gap-1 rounded px-1 transition-colors hover:bg-muted/50">
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
          <input
            type="text"
            aria-label={`Rename ${noun.toLowerCase()} ${entry.name}`}
            defaultValue={entry.name}
            autoFocus
            className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-[13px] outline-none focus:border-ring"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitRename(event.currentTarget.value);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setRenaming(false);
              }
            }}
            onBlur={(event) => submitRename(event.currentTarget.value)}
          />
        ) : (
          <button
            type="button"
            aria-expanded={open}
            className="flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-3 py-1 text-left text-[13px]"
            onClick={() => setOpen((value) => !value)}
          >
            <span className={cn("truncate", entry.kind === "tag" && "text-primary")}>
              {`${sigil}${entry.name}`}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground/60">{entry.noteCount}</span>
          </button>
        )}
        {!renaming && (
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
              onClick={() => commit(buildDeleteReferenceOperation(entry))}
            >
              <Trash2Icon size={12} />
            </button>
          </span>
        )}
      </div>
      {picking && (
        <div
          role="group"
          aria-label={`Color for ${entry.name}`}
          className="flex flex-wrap items-center gap-1.5 px-2 pt-1.5"
        >
          {referenceColorSwatches.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Set color ${color}`}
              aria-pressed={entry.color === color}
              className="flex size-4 items-center justify-center rounded-full border border-black/10"
              style={{ backgroundColor: color }}
              onClick={() => recolor(color)}
            >
              {entry.color === color && <CheckIcon size={10} className="text-white" />}
            </button>
          ))}
          <button
            type="button"
            aria-label="Clear color"
            className="flex size-4 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground hover:text-foreground"
            onClick={() => recolor(null)}
          >
            <CloseIcon size={10} />
          </button>
        </div>
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
