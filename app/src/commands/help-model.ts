import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import {
  effectiveShortcutKeys,
  isKeySequence,
  shortcutBindsOnPlatform,
} from "./bindings";
import type { ShortcutOverrides } from "./bindings";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type {
  ShortcutActionId,
  ShortcutDefinition,
  ShortcutGuard,
  ShortcutPlatform,
} from "./definitions";

export type ShortcutHelpCombo = {
  /** The raw combo string, so the filter can match what the user typed. */
  keys: string;
  /** One display chunk per sequence step; a plain chord has a single step. */
  steps: readonly string[];
  sequence: boolean;
};

export type ShortcutHelpRow = {
  id: ShortcutActionId;
  label: string;
  description?: string;
  /** Short contextual condition derived from the definition's scopes and guards. */
  when?: string;
  combos: readonly ShortcutHelpCombo[];
};

export type ShortcutHelpGroup = {
  group: string;
  rows: readonly ShortcutHelpRow[];
};

export type ShortcutHelpQuery = {
  overrides: ShortcutOverrides;
  platform: ShortcutPlatform;
  query?: string;
  definitions?: readonly ShortcutDefinition[];
};

/**
 * Human-readable condition per scope name. Keyed off the same scope strings the
 * bindings declare, so a definition gaining a scope gets a "when" for free
 * instead of prose copied into the overlay.
 */
const SCOPE_WHEN: Record<string, string> = {
  "notes-route": "Notes view",
  "sidebar-route": "Notes or journal view",
  markdown: "Markdown mode",
  tabs: "Tabs open",
  split: "Split view",
  "note-focus": "Editor focused",
  "tags-route": "Tags view",
  journal: "Journal view",
};

/**
 * Conditions worth showing per guard. `modal` is deliberately absent: every
 * binding is inert behind a dialog, so printing it would repeat on most rows.
 */
const GUARD_WHEN: Partial<Record<ShortcutGuard, string>> = {
  typing: "Not while typing",
  textField: "Outside text fields",
  sidebarTree: "Outside the sidebar tree",
};

function scopeList(scopes: string | readonly string[] | undefined): readonly string[] {
  if (scopes === undefined) {
    return [];
  }
  return typeof scopes === "string" ? [scopes] : scopes;
}

/**
 * The conditions under which a binding fires, derived from its scopes, guards,
 * and whether it is bound to an editor surface rather than the window.
 */
export function shortcutWhenLabel(definition: ShortcutDefinition): string | undefined {
  const parts: string[] = [];
  if (definition.boundInEditor) {
    parts.push("In the editor");
  }
  for (const scope of [...scopeList(definition.scopes), ...(definition.allScopes ?? [])]) {
    const label = SCOPE_WHEN[scope];
    if (label && !parts.includes(label)) {
      parts.push(label);
    }
  }
  if (definition.worksWhileTyping !== true) {
    const typing = GUARD_WHEN.typing;
    if (typing) {
      parts.push(typing);
    }
  }
  for (const guard of definition.guards ?? []) {
    const label = GUARD_WHEN[guard];
    if (label && !parts.includes(label)) {
      parts.push(label);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function helpCombo(keys: string, platform: ShortcutPlatform): ShortcutHelpCombo {
  return {
    keys,
    steps: keys.split(" then ").map((step) => formatShortcut(step, platform)),
    sequence: isKeySequence(keys),
  };
}

/**
 * Every combo that actually fires for a definition on `platform`: the effective
 * primary binding plus the alternate when the definition declares one. Returns
 * nothing when the default combo does not bind on this platform and the user has
 * not rebound it, so the overlay never advertises a dead key.
 */
export function shortcutHelpCombos(
  definition: ShortcutDefinition,
  overrides: ShortcutOverrides,
  platform: ShortcutPlatform,
): readonly ShortcutHelpCombo[] {
  if (!shortcutBindsOnPlatform(definition, overrides, platform)) {
    return [];
  }
  const combos = [helpCombo(effectiveShortcutKeys(definition, overrides), platform)];
  if (definition.secondaryKeys) {
    combos.push(helpCombo(definition.secondaryKeys, platform));
  }
  return combos;
}

export function shortcutHelpRow(
  definition: ShortcutDefinition,
  overrides: ShortcutOverrides,
  platform: ShortcutPlatform,
): ShortcutHelpRow | null {
  const combos = shortcutHelpCombos(definition, overrides, platform);
  if (combos.length === 0) {
    return null;
  }
  const when = shortcutWhenLabel(definition);
  return {
    id: definition.id,
    label: definition.label,
    ...(definition.description ? { description: definition.description } : {}),
    ...(when ? { when } : {}),
    combos,
  };
}

/**
 * Spellings a user is likely to type for a key whose canonical name differs.
 * Keyed by the token as the definitions write it, so "pgup" and "page up" both
 * find `ctrl+shift+pageup` without the overlay printing either spelling.
 */
const KEY_ALIASES: Record<string, readonly string[]> = {
  pageup: ["pgup", "page up", "prior"],
  pagedown: ["pgdn", "pgdown", "page down", "next"],
  arrowup: ["up", "up arrow"],
  arrowdown: ["down", "down arrow"],
  arrowleft: ["left", "left arrow"],
  arrowright: ["right", "right arrow"],
  escape: ["esc"],
  delete: ["del"],
  backspace: ["bksp", "back space"],
  enter: ["return"],
  space: ["spacebar"],
  mod: ["cmd", "command", "meta", "ctrl", "control", "super"],
  meta: ["cmd", "command", "super", "win"],
  ctrl: ["control"],
  alt: ["option", "opt"],
};

/**
 * Every spelling of a combo a user might type: the cartesian product of each
 * token with its aliases, so "cmd shift pgup" still finds `mod+shift+pageup`.
 */
const comboAliasCache = new Map<string, readonly string[]>();

function comboAliases(keys: string): readonly string[] {
  const cached = comboAliasCache.get(keys);
  if (cached) {
    return cached;
  }
  const tokens = keys.toLowerCase().split(/[+\s]+/);
  let combos: string[][] = [[]];
  for (const token of tokens) {
    const options = [token, ...(KEY_ALIASES[token] ?? [])];
    combos = combos.flatMap((prefix) => options.map((option) => [...prefix, option]));
  }
  const spellings = combos.map((combo) => combo.join("+"));
  for (const token of tokens) {
    spellings.push(...(KEY_ALIASES[token] ?? []));
  }
  comboAliasCache.set(keys, spellings);
  return spellings;
}

function rowHaystackParts(group: string, row: ShortcutHelpRow): readonly string[] {
  const parts = [group, row.label, row.description ?? "", row.when ?? ""];
  for (const combo of row.combos) {
    parts.push(combo.keys, combo.steps.join(" "), ...comboAliases(combo.keys));
  }
  return parts.map((part) => part.toLowerCase());
}

function collapseSeparators(value: string): string {
  return value.replaceAll(/[\s+_-]+/g, "");
}

/**
 * Whether a row survives the filter. Matches the label, the longer description,
 * the "when" copy, the group, and both the raw and formatted combo, with `+`,
 * `-` and spaces optional so "modk" finds `mod+k` and "page up" finds `pageup`.
 */
export function shortcutHelpMatches(
  group: string,
  row: ShortcutHelpRow,
  query: string,
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return true;
  }
  const parts = rowHaystackParts(group, row);
  if (parts.join(" ").includes(trimmed)) {
    return true;
  }
  const collapsed = collapseSeparators(trimmed);
  return (
    collapsed.length > 0 && parts.some((part) => collapseSeparators(part).includes(collapsed))
  );
}

/**
 * The cheat sheet's view model: every binding that fires on this platform,
 * grouped in definition order and filtered by `query`. Groups left empty by the
 * filter are dropped so the overlay never renders a bare heading.
 */
export function shortcutHelpGroups({
  overrides,
  platform,
  query = "",
  definitions = SHORTCUT_DEFINITIONS,
}: ShortcutHelpQuery): readonly ShortcutHelpGroup[] {
  const groups: ShortcutHelpGroup[] = [];
  const rowsByGroup = new Map<string, ShortcutHelpRow[]>();
  for (const definition of definitions) {
    const row = shortcutHelpRow(definition, overrides, platform);
    if (!row || !shortcutHelpMatches(definition.group, row, query)) {
      continue;
    }
    const existing = rowsByGroup.get(definition.group);
    if (existing) {
      existing.push(row);
      continue;
    }
    const rows = [row];
    rowsByGroup.set(definition.group, rows);
    groups.push({ group: definition.group, rows });
  }
  return groups;
}

export function shortcutHelpRowCount(groups: readonly ShortcutHelpGroup[]): number {
  return groups.reduce((total, group) => total + group.rows.length, 0);
}
