import { effectiveShortcutKeys } from "./bindings";
import type { ShortcutOverrides } from "./bindings";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type { ShortcutDefinition } from "./definitions";

export type ShortcutSettingsGroup = {
  group: string;
  definitions: readonly ShortcutDefinition[];
};

function normalize(text: string): string {
  return text.toLowerCase().replaceAll("+", " ").replace(/\s+/g, " ").trim();
}

function definitionHaystack(
  definition: ShortcutDefinition,
  overrides: ShortcutOverrides,
): string {
  const keys = effectiveShortcutKeys(definition, overrides);
  const parts = [
    definition.group,
    definition.label,
    definition.description ?? "",
    keys,
    keys.replaceAll("mod", "ctrl"),
    keys.replaceAll("mod", "cmd"),
  ];
  if (definition.secondaryKeys) {
    parts.push(definition.secondaryKeys);
  }
  return normalize(parts.join(" "));
}

/**
 * Whether a definition survives the settings filter. Matches the label, the
 * longer description, the group, and the effective combo — with `mod` also
 * matching as ctrl/cmd, and `+` and spaces optional so "ctrlk" finds `mod+k`.
 */
export function shortcutSettingsMatches(
  definition: ShortcutDefinition,
  overrides: ShortcutOverrides,
  query: string,
): boolean {
  const needle = normalize(query);
  if (needle.length === 0) {
    return true;
  }
  const haystack = definitionHaystack(definition, overrides);
  return (
    haystack.includes(needle) ||
    haystack.replaceAll(" ", "").includes(needle.replaceAll(" ", ""))
  );
}

/**
 * The shortcuts section's view model: every definition that matches `query`,
 * grouped in definition order. Groups left empty by the filter are dropped so
 * the section never renders a bare heading.
 */
export function filterShortcutSettings(
  overrides: ShortcutOverrides,
  query: string,
  definitions: readonly ShortcutDefinition[] = SHORTCUT_DEFINITIONS,
): readonly ShortcutSettingsGroup[] {
  const groups: ShortcutSettingsGroup[] = [];
  const byGroup = new Map<string, ShortcutDefinition[]>();
  for (const definition of definitions) {
    if (!shortcutSettingsMatches(definition, overrides, query)) {
      continue;
    }
    const existing = byGroup.get(definition.group);
    if (existing) {
      existing.push(definition);
      continue;
    }
    const members = [definition];
    byGroup.set(definition.group, members);
    groups.push({ group: definition.group, definitions: members });
  }
  return groups;
}

export function shortcutSettingsCount(
  groups: readonly ShortcutSettingsGroup[],
): number {
  return groups.reduce((total, group) => total + group.definitions.length, 0);
}

/**
 * Autocomplete suggestions for the filter bar: labels of matching definitions,
 * label-prefix matches first. Empty when the query is blank or already names a
 * single suggestion exactly, so an accepted suggestion closes the list.
 */
export function shortcutSearchSuggestions(
  overrides: ShortcutOverrides,
  query: string,
  definitions: readonly ShortcutDefinition[] = SHORTCUT_DEFINITIONS,
  limit = 8,
): readonly string[] {
  const needle = normalize(query);
  if (needle.length === 0) {
    return [];
  }
  const prefixed: string[] = [];
  const rest: string[] = [];
  for (const definition of definitions) {
    if (!shortcutSettingsMatches(definition, overrides, query)) {
      continue;
    }
    const bucket = definition.label.toLowerCase().startsWith(needle) ? prefixed : rest;
    bucket.push(definition.label);
  }
  const suggestions = [...new Set([...prefixed, ...rest])].slice(0, limit);
  if (suggestions.length === 1 && suggestions[0]?.toLowerCase() === needle) {
    return [];
  }
  return suggestions;
}
