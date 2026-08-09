import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, ClockIcon, FileTextIcon } from "../shared/icons";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { NoteMetadata, RendererState, RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
  onSelect: (id: string) => void;
};

export type RecentNote = {
  id: string;
  title: string;
  updatedAt: number;
};

const MAX_RECENTS = 5;
const OPEN_STORAGE_KEY = "skriuw.sidebar-recents-open";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_STORAGE_KEY) !== "closed";
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, open ? "open" : "closed");
  } catch {
    return;
  }
}

/**
 * The most recently updated notes, newest first, capped at `max`. Journal
 * entries never appear because `noteIds` already excludes them.
 */
export function recentNotes(
  noteIds: readonly string[],
  metadata: ReadonlyMap<string, NoteMetadata>,
  max: number = MAX_RECENTS,
): RecentNote[] {
  const recents: RecentNote[] = [];
  for (const id of noteIds) {
    const meta = metadata.get(id);
    if (meta === undefined) {
      continue;
    }
    recents.push({ id, title: meta.title, updatedAt: meta.updatedAt });
  }
  recents.sort((left, right) => right.updatedAt - left.updatedAt);
  return recents.slice(0, max);
}

/**
 * Formats a note's age as a terse sidebar badge: "now", "5m", "3h", "2d",
 * "4w", "6mo", "1y".
 */
export function compactAge(updatedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - updatedAt) / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}w`;
  }
  if (days < 365) {
    return `${Math.floor(days / 30)}mo`;
  }
  return `${Math.floor(days / 365)}y`;
}

function selectRecentNotes(state: RendererState): readonly RecentNote[] {
  return recentNotes(state.noteIds, state.metadata);
}

function sameRecents(left: readonly RecentNote[], right: readonly RecentNote[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        item.id === other.id &&
        item.title === other.title &&
        item.updatedAt === other.updatedAt
      );
    })
  );
}

function selectActiveNoteId(state: RendererState) {
  return state.activeNoteId;
}

/**
 * Collapsible "Recent" section anchored above the calendar at the bottom of
 * the workspace sidebar: the five most recently updated notes with a terse
 * age badge. Picking one reveals and activates it in the tree.
 */
export function SidebarRecents({ store, onSelect }: Props) {
  const [open, setOpen] = useState(readOpen);
  const recents = useRendererSelector(store, selectRecentNotes, sameRecents);
  const activeNoteId = useRendererSelector(store, selectActiveNoteId);
  const now = Date.now();

  function toggleOpen(): void {
    setOpen((current) => {
      writeOpen(!current);
      return !current;
    });
  }

  if (recents.length === 0) {
    return null;
  }

  return (
    <section className="shrink-0 border-t border-sidebar-border" aria-label="Recent notes">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        {open ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
        <ClockIcon size={11} />
        Recent
      </button>
      {open && (
        <ul className="px-1.5 pb-1.5">
          {recents.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => onSelect(note.id)}
                className={`group flex h-[26px] w-full min-w-0 items-center gap-2 rounded-md px-2.5 text-left text-[12px] transition-colors hover:bg-accent focus-visible:bg-foreground/[0.22] focus-visible:shadow-none focus-visible:outline-none ${
                  note.id === activeNoteId
                    ? "text-foreground"
                    : "text-sidebar-foreground/80 hover:text-foreground"
                }`}
              >
                <FileTextIcon
                  size={13}
                  className="shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{note.title || "Untitled"}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                  {compactAge(note.updatedAt, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
