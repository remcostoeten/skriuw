import { useEffect, useMemo, useRef, useState } from "react";
import { activateNote } from "@/store/actions/workspace";
import { appRouteHash, journalDayHash } from "@/app-route";
import { JOURNAL_ROOT_ID } from "@/features/journal/constants";
import { journalEntryDateKey } from "@/features/journal/model";
import { searchWorkspace } from "@/bridge/commands";
import type { CommandRegistry, CommandUiState } from "./registry";
import type { SearchHit } from "@/contracts/workspace";
import {
  projectEntities,
  type EntityKind,
  type EntityRow,
} from "@/features/references/entity-manager-model";
import { describeSearchFilterProblem } from "@/features/search/filter-resolution";
import { applySearchPlan, planWorkspaceSearch } from "@/features/search/search-plan";
import { CircleIcon, FileTextIcon, SearchIcon, WaypointsIcon } from "@/shared/icons/static";
import { fuzzyMatchScore } from "@/shared/lib/fuzzy-match";
import { CommandPalette } from "./command-palette";
import { RECENT_NOTES_GROUP, type CommandPaletteItem } from "./command-palette-model";
import { compactAge, recentNotes } from "./recent-notes";
import { effectiveShortcutKeys, shortcutOverridesFromSettings } from "./bindings";
import { useShortcutHints } from "./hints";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type { ShortcutActionId, ShortcutDefinition } from "./definitions";
import type { RendererState, RendererStore } from "@/store/types";

const PALETTE_SHORTCUT_IDS = ["toggleCommandPalette"] as const;

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
 * "Notes" group, so content hits only add notes found by body text. A
 * relationship-filtered query hides that title index, so every hit is kept.
 */
function contentItems(
  store: RendererStore,
  hits: readonly SearchHit[],
  query: string,
  dedupeAgainstTitles: boolean,
): CommandPaletteItem[] {
  return hits
    .filter((hit) => !dedupeAgainstTitles || fuzzyMatchScore(query, hit.title) === null)
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

/**
 * The most recently updated notes, newest first, reached by typing `recents`.
 * Ids stay distinct from the title index so frecency and React keys never
 * collide with the same note's "Notes" row.
 */
function recentNoteItems(store: RendererStore, state: RendererState): CommandPaletteItem[] {
  const now = Date.now();
  return recentNotes(state.noteIds, state.metadata).map((note) => ({
    id: `recent:${note.id}`,
    label: note.title || "Untitled",
    hint: compactAge(note.updatedAt, now),
    group: RECENT_NOTES_GROUP,
    searchOnly: true,
    icon: <FileTextIcon size={15} />,
    action: () => activateNote(store, note.id),
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

  const plan = useMemo(
    () => planWorkspaceSearch(store.getState(), open ? searchQuery : "", SEARCH_LIMIT),
    [store, searchQuery, open],
  );

  useEffect(() => {
    requestRef.current += 1;
    const requestId = requestRef.current;
    if (!plan.requiresFullText) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchWorkspace(plan.text, plan.fullTextLimit)
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
  }, [plan]);

  const items = useMemo<CommandPaletteItem[]>(() => {
    if (!open) {
      return [];
    }
    const state = store.getState();
    const results = applySearchPlan(state, plan, hits, SEARCH_LIMIT);
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
      ...recentNoteItems(store, state),
      ...entityItems(projectEntities(state, "tag"), "tag"),
      ...entityItems(projectEntities(state, "person"), "person"),
      ...contentItems(store, results, plan.text, plan.allowedNoteIds === null),
    ];
  }, [open, registry, ui, hits, plan, store]);

  const paletteHints = useShortcutHints(store, PALETTE_SHORTCUT_IDS);

  const notice = plan.resolution.problems.map(describeSearchFilterProblem).join(" ") || null;

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      onQueryChange={setSearchQuery}
      notice={notice}
      paletteShortcut={paletteHints.toggleCommandPalette}
    />
  );
}
