import { useEffect, useMemo, useRef, useState } from "react";
import { activateNote } from "@/actions/workspace";
import { appRouteHash, journalDayHash } from "@/app-route";
import { JOURNAL_ROOT_ID } from "@/journal/constants";
import { journalEntryDateKey } from "@/journal/model";
import { searchWorkspace } from "@/bridge/commands";
import type { CommandRegistry, CommandUiState } from "./registry";
import type { SearchHit } from "@/contracts/workspace";
import {
  projectEntities,
  type EntityKind,
  type EntityRow,
} from "@/references/entity-manager-model";
import { CircleIcon, FileTextIcon, SearchIcon, WaypointsIcon } from "@/shared/icons";
import { fuzzyMatchScore } from "@/shared/lib/fuzzy-match";
import { CommandPalette } from "./command-palette";
import type { CommandPaletteItem } from "./command-palette-model";
import { effectiveShortcutKeys, shortcutOverridesFromSettings } from "./bindings";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type { ShortcutActionId, ShortcutDefinition } from "./definitions";
import type { RendererState, RendererStore } from "@/store/types";

const SEARCH_DEBOUNCE_MS = 120;
const SEARCH_LIMIT = 8;

const DEFINITION_BY_ID: ReadonlyMap<ShortcutActionId, ShortcutDefinition> = new Map(
  SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

type NoteEntry = {
  id: string;
  title: string;
};

function selectNoteEntries(state: RendererState): NoteEntry[] {
  const notes: NoteEntry[] = [];
  for (const id of state.nodeOrder) {
    const node = state.nodes.get(id);
    if (node?.kind === "note" && node.parentId !== JOURNAL_ROOT_ID) {
      notes.push({ id, title: node.title });
    }
  }
  return notes;
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
      action: () => {
        // Journal entries open on their day in the journal, not as a note.
        const dateKey = journalEntryDateKey(store.getState(), hit.noteId);
        if (dateKey !== null) {
          window.location.hash = journalDayHash(dateKey);
          return;
        }
        activateNote(store, hit.noteId);
      },
    }));
}

/**
 * Tags and people as browsable palette rows, surfaced under the `!t` / `!p`
 * bangs or a text search. Kept `searchOnly` so the idle palette stays lean;
 * selecting one jumps to its management route.
 */
function entityItems(rows: readonly EntityRow[], kind: EntityKind): CommandPaletteItem[] {
  const group = kind === "tag" ? "Tags" : "People";
  const route = kind === "tag" ? "tags" : "people";
  return rows.map((row) => ({
    id: `${kind}:${row.id}`,
    label: row.name,
    hint: `${row.noteCount} ${row.noteCount === 1 ? "note" : "notes"}`,
    group,
    searchOnly: true,
    icon: kind === "tag" ? <WaypointsIcon size={15} /> : <CircleIcon size={15} />,
    action: () => {
      window.location.hash = appRouteHash(route);
    },
  }));
}

type Props = {
  store: RendererStore;
  registry: CommandRegistry;
  ui: CommandUiState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPaletteHost({ store, registry, ui, open, onOpenChange }: Props) {
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

  const items = useMemo<CommandPaletteItem[]>(() => {
    if (!open) {
      return [];
    }
    const state = store.getState();
    const overrides = shortcutOverridesFromSettings(state.settings);
    return [
      ...registry.paletteItems(state, ui, (actionId) => {
        const definition = DEFINITION_BY_ID.get(actionId);
        return definition ? effectiveShortcutKeys(definition, overrides) : "";
      }),
      ...selectNoteEntries(state).map(
        (note): CommandPaletteItem => ({
          id: `note:${note.id}`,
          label: note.title,
          keywords: ["open"],
          group: "Notes",
          icon: <FileTextIcon size={15} />,
          action: () => activateNote(store, note.id),
        }),
      ),
      ...entityItems(projectEntities(state, "tag"), "tag"),
      ...entityItems(projectEntities(state, "person"), "person"),
      ...contentItems(store, hits, searchQuery.trim()),
    ];
  }, [open, registry, ui, hits, searchQuery, store]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      onQueryChange={setSearchQuery}
    />
  );
}
