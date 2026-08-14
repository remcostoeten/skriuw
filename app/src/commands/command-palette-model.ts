import type { ReactNode } from "react";
import { parseSearchQuery } from "@/features/search/query-parser";
import { fuzzyMatchScore } from "@/shared/lib/fuzzy-match";

export type CommandPaletteItem = {
  id: string;
  label: string;
  shortcut?: string;
  keywords?: readonly string[];
  description?: string;
  hint?: string;
  icon?: ReactNode;
  group?: string;
  alwaysShow?: boolean;
  /**
   * Hidden while the palette is idle (no query, no bang). Surfaces only once
   * the user searches or scopes to its group with a bang. Keeps large indexes
   * out of the default view.
   */
  searchOnly?: boolean;
  action: () => void;
};

export type CommandPaletteGroup = {
  group: string;
  items: CommandPaletteItem[];
};

const DEFAULT_GROUP = "Actions";
const RECENT_GROUP = "Recent";
const CONTENT_GROUP = "Content";
export const RECENT_NOTES_GROUP = "Recent notes";
const MAX_RECENT_ITEMS = 5;
const GROUP_ORDER = [
  RECENT_GROUP,
  DEFAULT_GROUP,
  RECENT_NOTES_GROUP,
  "Notes",
  CONTENT_GROUP,
  "Tags",
  "People",
  "Navigation",
  "Editor",
];

export type CommandBang = {
  /** Canonical single-letter key, e.g. `"n"`; the value returned as `bang`. */
  key: string;
  label: string;
  /** Groups this bang keeps visible. */
  groups: string[];
  /**
   * Accepted spellings. A typed token matches when it equals an alias or is a
   * unique prefix of one, so `!p`, `!per`, and `!people` all scope to People.
   */
  aliases: string[];
};

/**
 * Bang prefixes scope the palette to a slice of groups. `!n foo` searches only
 * notes for "foo"; a bare `!a` lists every action. Typing more of the word
 * keeps working (`!act`, `!action`) as long as it stays unambiguous.
 */
export const COMMAND_BANGS: readonly CommandBang[] = [
  {
    key: "a",
    label: "Actions",
    groups: [DEFAULT_GROUP, "Navigation", "Editor"],
    aliases: ["a", "act", "action", "actions"],
  },
  {
    key: "n",
    label: "Notes",
    groups: ["Notes", CONTENT_GROUP, RECENT_GROUP],
    aliases: ["n", "note", "notes"],
  },
  {
    key: "t",
    label: "Tags",
    groups: ["Tags"],
    aliases: ["t", "tag", "tags"],
  },
  {
    key: "p",
    label: "People",
    groups: ["People"],
    aliases: ["p", "person", "people", "persons", "ppl"],
  },
  {
    key: "g",
    label: "Go to",
    groups: ["Navigation"],
    aliases: ["g", "go", "goto", "nav", "navigation"],
  },
];

/**
 * Resolves a typed bang token to a single bang. Prefers an exact alias hit,
 * then falls back to a unique alias prefix. Ambiguous tokens (`!x` matching two
 * bangs) resolve to null so the palette treats them as plain text.
 */
function resolveBang(token: string): CommandBang | null {
  const lower = token.toLowerCase();
  const exact = COMMAND_BANGS.find((bang) => bang.aliases.includes(lower));
  if (exact) {
    return exact;
  }
  const prefixed = COMMAND_BANGS.filter((bang) =>
    bang.aliases.some((alias) => alias.startsWith(lower)),
  );
  return prefixed.length === 1 ? (prefixed[0] ?? null) : null;
}

export type CommandPaletteMode = "recents";

export type ParsedCommandQuery = {
  bang: string | null;
  /** Set when a keyword scope like `recents` owns the input. */
  mode: CommandPaletteMode | null;
  allowedGroups: Set<string> | null;
  query: string;
};

/**
 * Typing the whole word switches the palette into the recents list; anything
 * after it filters that list. Spelled out rather than bang-scoped because it is
 * the only entry point to recents now that the sidebar section is gone.
 */
const RECENTS_KEYWORD = /^(?:recents?|recently)(?:\s+(.*))?$/i;

/**
 * Splits a leading `!token` bang or a `recents` keyword off the raw input.
 * Returns the matched bang key (or null), the mode it entered, the set of
 * groups it unlocks, and the remaining search text. A lone `!` or an unknown
 * bang is treated as plain text so typing stays fluid.
 */
export function parseCommandQuery(raw: string): ParsedCommandQuery {
  const match = raw.match(/^!([a-z]+)(?:\s+(.*))?$/i);
  if (match) {
    const bang = resolveBang(match[1] ?? "");
    if (bang) {
      return {
        bang: bang.key,
        mode: null,
        allowedGroups: new Set(bang.groups),
        query: (match[2] ?? "").trim(),
      };
    }
  }

  const recents = raw.match(RECENTS_KEYWORD);
  if (recents) {
    return {
      bang: null,
      mode: "recents",
      allowedGroups: new Set([RECENT_NOTES_GROUP]),
      query: (recents[1] ?? "").trim(),
    };
  }

  return { bang: null, mode: null, allowedGroups: null, query: raw.trim() };
}

function getItemGroup(item: CommandPaletteItem): string {
  return item.group?.trim() || DEFAULT_GROUP;
}

/**
 * Best fuzzy score for an item across its searchable fields. The label is
 * weighted double so title hits outrank keyword/description hits. Returns
 * null when nothing matches.
 */
function getItemMatchScore(item: CommandPaletteItem, query: string): number | null {
  const labelScore = fuzzyMatchScore(query, item.label);
  let best = labelScore === null ? null : labelScore * 2;

  const secondaryFields = [
    item.description,
    item.hint,
    item.shortcut,
    getItemGroup(item),
    ...(item.keywords ?? []),
  ];

  for (const field of secondaryFields) {
    if (!field) {
      continue;
    }
    const score = fuzzyMatchScore(query, field);
    if (score !== null && (best === null || score > best)) {
      best = score;
    }
  }

  return best;
}

function compareGroups(a: string, b: string): number {
  const aIndex = GROUP_ORDER.indexOf(a);
  const bIndex = GROUP_ORDER.indexOf(b);
  if (aIndex >= 0 && bIndex >= 0) {
    return aIndex - bIndex;
  }
  if (aIndex >= 0) {
    return -1;
  }
  if (bIndex >= 0) {
    return 1;
  }
  return a.localeCompare(b);
}

function scopeGroups(bangGroups: Set<string> | null, filtersActive: boolean): Set<string> | null {
  if (!filtersActive) {
    return bangGroups;
  }
  if (!bangGroups) {
    return new Set([CONTENT_GROUP]);
  }
  return bangGroups.has(CONTENT_GROUP) ? new Set([CONTENT_GROUP]) : new Set();
}

function buildRecentItems(
  items: readonly CommandPaletteItem[],
  frecency: Record<string, number>,
): CommandPaletteItem[] {
  return items
    .filter((item) => getItemGroup(item) !== RECENT_NOTES_GROUP)
    .filter((item) => (frecency[item.id] ?? 0) > 0)
    .sort((a, b) => (frecency[b.id] ?? 0) - (frecency[a.id] ?? 0))
    .slice(0, MAX_RECENT_ITEMS);
}

export function getCommandPaletteGroups(
  items: readonly CommandPaletteItem[],
  query: string,
  frecency: Record<string, number> = {},
): CommandPaletteGroup[] {
  const { allowedGroups: bangGroups, query: searchQuery } = parseCommandQuery(query);
  const parsed = parseSearchQuery(searchQuery);
  const normalizedQuery = parsed.text.toLowerCase();
  // A relationship filter turns the palette into a content query: only the
  // host's filtered results answer it, so the title, action and entity indexes
  // step aside rather than listing rows the filter never narrowed.
  const allowedGroups = scopeGroups(bangGroups, parsed.filters.length > 0);
  const bangActive = allowedGroups !== null;
  const grouped = new Map<string, CommandPaletteItem[]>();
  const matchScores = new Map<string, number>();

  if (!normalizedQuery && (!allowedGroups || allowedGroups.has(RECENT_GROUP))) {
    const recentItems = buildRecentItems(items, frecency);
    if (recentItems.length > 0) {
      grouped.set(RECENT_GROUP, recentItems);
    }
  }

  for (const item of items) {
    const group = getItemGroup(item);

    if (allowedGroups && !allowedGroups.has(group)) {
      continue;
    }

    // Recents are a scope, not a ranking: every one of them also lives in the
    // title index, so surfacing them on a plain query would double every row.
    if (group === RECENT_NOTES_GROUP && !allowedGroups?.has(group)) {
      continue;
    }

    if (item.searchOnly && !normalizedQuery && !bangActive) {
      continue;
    }

    if (normalizedQuery) {
      const score = getItemMatchScore(item, normalizedQuery);
      if (score === null && !(item.alwaysShow ?? false)) {
        continue;
      }
      matchScores.set(item.id, (score ?? 0) + Math.min(frecency[item.id] ?? 0, 10));
    }

    const groupItems = grouped.get(group) ?? [];
    groupItems.push(item);
    grouped.set(group, groupItems);
  }

  if (normalizedQuery) {
    for (const groupItems of grouped.values()) {
      groupItems.sort((a, b) => (matchScores.get(b.id) ?? 0) - (matchScores.get(a.id) ?? 0));
    }
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => compareGroups(a, b))
    .map(([group, groupItems]) => ({ group, items: groupItems }));
}
