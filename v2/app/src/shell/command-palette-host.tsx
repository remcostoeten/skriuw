import { useEffect, useMemo, useRef, useState } from "react";
import { activateNote, createFolder, createNote } from "../actions/workspace";
import { searchWorkspace } from "../bridge/commands";
import type { SearchHit } from "../contracts/workspace";
import { FileTextIcon, NewFolderIcon, NewNoteIcon, SearchIcon } from "../shared/icons";
import { fuzzyMatchScore } from "../shared/lib/fuzzy-match";
import { CommandPalette } from "../shared/ui/command-palette";
import type { CommandPaletteItem } from "../shared/ui/command-palette-model";
import { SHORTCUT_DEFINITIONS } from "../shortcuts/definitions";
import type { ShortcutActionId } from "../shortcuts/definitions";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";

const SEARCH_DEBOUNCE_MS = 120;
const SEARCH_LIMIT = 8;

const SHORTCUT_KEYS: ReadonlyMap<ShortcutActionId, string> = new Map(
  SHORTCUT_DEFINITIONS.map((definition) => [
    definition.id,
    Array.isArray(definition.keys) ? (definition.keys[0] ?? "") : definition.keys,
  ]),
);

type NoteEntry = {
  id: string;
  title: string;
};

function selectNoteEntries(state: RendererState): NoteEntry[] {
  const notes: NoteEntry[] = [];
  for (const id of state.nodeOrder) {
    const node = state.nodes.get(id);
    if (node?.kind === "note") {
      notes.push({ id, title: node.title });
    }
  }
  return notes;
}

function sameNoteEntries(left: NoteEntry[], right: NoteEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) => entry.id === right[index]?.id && entry.title === right[index]?.title,
    )
  );
}

function snippetText(snippet: string): string {
  return snippet.replaceAll("<mark>", "").replaceAll("</mark>", "");
}

/**
 * Full-text hits the palette shows under "Content". Hits whose title already
 * fuzzy-matches the query are dropped: the title index surfaces those in the
 * "Notes" group, so content hits only add notes found by body text.
 */
function contentItems(
  store: RendererStore,
  hits: readonly SearchHit[],
  query: string,
): CommandPaletteItem[] {
  return hits
    .filter((hit) => fuzzyMatchScore(query, hit.title) === null)
    .map((hit) => ({
      id: `note:${hit.noteId}`,
      label: hit.title,
      hint: snippetText(hit.snippet),
      group: "Content",
      searchOnly: true,
      alwaysShow: true,
      icon: <SearchIcon size={15} />,
      action: () => activateNote(store, hit.noteId),
    }));
}

type Props = {
  store: RendererStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPaletteHost({ store, open, onOpenChange }: Props) {
  const notes = useRendererSelector(store, selectNoteEntries, sameNoteEntries);
  const [searchQuery, setSearchQuery] = useState("");
  const [hits, setHits] = useState<readonly SearchHit[]>([]);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    requestRef.current += 1;
    const requestId = requestRef.current;
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchWorkspace(trimmed, SEARCH_LIMIT)
        .then((results) => {
          if (requestRef.current === requestId) {
            setHits(results);
          }
        })
        .catch((error) => {
          console.error("workspace search rejected", error);
          if (requestRef.current === requestId) {
            setHits([]);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const items = useMemo<CommandPaletteItem[]>(
    () => [
      {
        id: "new-note",
        label: "New note",
        shortcut: SHORTCUT_KEYS.get("createNote"),
        keywords: ["create"],
        group: "Actions",
        icon: <NewNoteIcon size={15} />,
        action: () => createNote(store, null),
      },
      {
        id: "new-folder",
        label: "New folder",
        shortcut: SHORTCUT_KEYS.get("createFolder"),
        keywords: ["create"],
        group: "Actions",
        icon: <NewFolderIcon size={15} />,
        action: () => createFolder(store, null),
      },
      ...notes.map(
        (note): CommandPaletteItem => ({
          id: `note:${note.id}`,
          label: note.title,
          keywords: ["open"],
          group: "Notes",
          icon: <FileTextIcon size={15} />,
          action: () => activateNote(store, note.id),
        }),
      ),
      ...contentItems(store, hits, searchQuery.trim()),
    ],
    [notes, hits, searchQuery, store],
  );

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      onQueryChange={setSearchQuery}
    />
  );
}
