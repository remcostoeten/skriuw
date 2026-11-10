import {
  COMMAND_BANGS,
  parseCommandQuery,
  type CommandPaletteGroup,
} from "./command-palette-model";

export type PaletteScope = {
  key: string;
  label: string;
  token: string | null;
  prefix: string;
  groups: readonly string[] | null;
};

export const ALL_SCOPE = "all";
export const RECENTS_SCOPE = "recents";

export const PALETTE_SCOPES: readonly PaletteScope[] = [
  { key: ALL_SCOPE, label: "All", token: null, prefix: "", groups: null },
  ...COMMAND_BANGS.map((bang) => ({
    key: bang.key,
    label: bang.label,
    token: `!${bang.key}`,
    prefix: `!${bang.key} `,
    groups: bang.groups,
  })),
  { key: RECENTS_SCOPE, label: "Recents", token: null, prefix: "recents ", groups: null },
];

/**
 * @name scopedQuery
 * @description Rebuilds the raw query the palette model parses from a scope
 * held as state and the text left in the input.
 * @example scopedQuery("n", "alpha") // "!n alpha"
 */
export function scopedQuery(scope: string, text: string): string {
  const entry = PALETTE_SCOPES.find((candidate) => candidate.key === scope);
  return `${entry?.prefix ?? ""}${text}`;
}

/**
 * @name typedScope
 * @description Names the scope a raw query resolves to, so a bare `!n` lights
 * its tab before the space that commits it.
 * @example typedScope("!n") // "n"
 */
export function typedScope(raw: string): string {
  const parsed = parseCommandQuery(raw);
  if (parsed.bang) {
    return parsed.bang;
  }
  return parsed.mode === "recents" ? RECENTS_SCOPE : ALL_SCOPE;
}

export type ConsumedScope = {
  scope: string;
  text: string;
};

/**
 * @name consumeScopePrefix
 * @description Splits a committed scope prefix (a bang or `recents` followed by
 * whitespace) off the typed text so the scope can live on the tab strip.
 * Returns null while the prefix is still being typed.
 * @example consumeScopePrefix("!t idea") // { scope: "t", text: "idea" }
 */
export function consumeScopePrefix(text: string): ConsumedScope | null {
  // A leading token followed by whitespace, then whatever was typed after it.
  const committed = text.match(/^\S+\s+(.*)$/s);
  if (!committed) {
    return null;
  }
  const scope = typedScope(text);
  if (scope === ALL_SCOPE) {
    return null;
  }
  return { scope, text: committed[1] ?? "" };
}

/**
 * @name cycleScope
 * @description Steps to the neighbouring scope tab, wrapping at either end.
 * @example cycleScope("all", -1) // "recents"
 */
export function cycleScope(scope: string, delta: 1 | -1): string {
  const index = PALETTE_SCOPES.findIndex((candidate) => candidate.key === scope);
  const next = (Math.max(index, 0) + delta + PALETTE_SCOPES.length) % PALETTE_SCOPES.length;
  return PALETTE_SCOPES[next]?.key ?? ALL_SCOPE;
}

function groupSize(group: CommandPaletteGroup): number {
  return group.items.length + (group.hiddenCount ?? 0);
}

/**
 * @name scopeCounts
 * @description Counts how many results each scope tab holds for the current
 * search, from the unscoped groups and the recents groups.
 * @example scopeCounts(allGroups, recentGroups).get("n") // 3
 */
export function scopeCounts(
  allGroups: readonly CommandPaletteGroup[],
  recentGroups: readonly CommandPaletteGroup[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const scope of PALETTE_SCOPES) {
    if (scope.key === RECENTS_SCOPE) {
      counts.set(
        scope.key,
        recentGroups.reduce((total, group) => total + groupSize(group), 0),
      );
      continue;
    }
    const groups = scope.groups;
    const counted = groups ? allGroups.filter((group) => groups.includes(group.group)) : allGroups;
    counts.set(
      scope.key,
      counted.reduce((total, group) => total + groupSize(group), 0),
    );
  }
  return counts;
}
