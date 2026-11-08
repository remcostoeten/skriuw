import { BUILTIN_THEMES, type ThemeColorScheme } from "@skriuw/theme";

export type ThemeVariant = {
  id: string;
  label: string;
  colorScheme: ThemeColorScheme;
  swatchFrom: string;
  swatchTo: string;
};

export type ThemeEntry = {
  id: string;
  label: string;
  colorScheme: ThemeColorScheme;
  swatchFrom: string;
  swatchTo: string;
  variants?: readonly ThemeVariant[];
};

function themeEntries(): ThemeEntry[] {
  const entries: ThemeEntry[] = [];
  const families = new Map<string, ThemeEntry>();
  for (const theme of BUILTIN_THEMES) {
    const family = "family" in theme ? theme.family : undefined;
    if (!family) {
      entries.push({
        id: theme.id,
        label: theme.label,
        colorScheme: theme.colorScheme,
        swatchFrom: theme.swatchFrom,
        swatchTo: theme.swatchTo,
      });
      continue;
    }
    const variant = {
      id: theme.id,
      label: theme.label,
      colorScheme: theme.colorScheme,
      swatchFrom: theme.swatchFrom,
      swatchTo: theme.swatchTo,
    };
    const existing = families.get(family.id);
    if (existing) {
      existing.variants = [...(existing.variants ?? []), variant];
      continue;
    }
    const entry: ThemeEntry = {
      id: theme.id,
      label: family.label,
      colorScheme: theme.colorScheme,
      swatchFrom: theme.swatchFrom,
      swatchTo: theme.swatchTo,
      variants: [variant],
    };
    families.set(family.id, entry);
    entries.push(entry);
  }
  return entries;
}

export const THEME_ENTRIES: readonly ThemeEntry[] = themeEntries();

export function activeThemeIndex(theme: string): number {
  return Math.max(
    0,
    THEME_ENTRIES.findIndex(
      (entry) => entry.id === theme || entry.variants?.some((variant) => variant.id === theme),
    ),
  );
}

export function isVariantActive(entry: ThemeEntry, theme: string): boolean {
  return entry.variants?.some((variant) => variant.id === theme) ?? false;
}

/**
 * @name shownThemeVariant
 * @description The theme a tile previews and applies: the active variant when
 * the family is in use, otherwise the variant last picked on that tile, and
 * the family's first variant before that.
 *
 * @example
 * shownThemeVariant(catppuccin, "catppuccin-latte", undefined); // "catppuccin-latte"
 */
export function shownThemeVariant(
  entry: ThemeEntry,
  theme: string,
  remembered: string | undefined,
): string {
  const variants = entry.variants;
  if (!variants) {
    return entry.id;
  }
  const active = variants.find((variant) => variant.id === theme);
  if (active) {
    return active.id;
  }
  return variants.find((variant) => variant.id === remembered)?.id ?? variants[0]?.id ?? entry.id;
}

/**
 * @name nextThemeVariant
 * @description The variant that follows the shown one, wrapping around, so a
 * keyboard press on an active family tile flips Mocha to Latte and back.
 *
 * @example
 * nextThemeVariant(rosePine, "rose-pine"); // "rose-pine-dawn"
 */
export function nextThemeVariant(entry: ThemeEntry, shown: string): string {
  const variants = entry.variants;
  if (!variants || variants.length === 0) {
    return entry.id;
  }
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.id === shown),
  );
  return variants[(index + 1) % variants.length]?.id ?? shown;
}

export type ThemeGridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * @name moveThemeTile
 * @description Moves through the theme grid with the arrow keys. Left and
 * Right walk the tiles in order and wrap; Up and Down move a row and stop at
 * the edges, landing on the last tile when the row below is short.
 *
 * @example
 * moveThemeTile(1, "ArrowDown", 7, 3); // 4
 */
export function moveThemeTile(
  index: number,
  key: ThemeGridKey,
  count: number,
  columns: number,
): number {
  if (count === 0) {
    return index;
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const delta = key === "ArrowLeft" ? -1 : 1;
    return (index + delta + count) % count;
  }
  if (key === "ArrowUp") {
    return index - columns >= 0 ? index - columns : index;
  }
  const below = index + columns;
  if (below < count) {
    return below;
  }
  const lastRowStart = count - (count % columns || columns);
  return index < lastRowStart ? count - 1 : index;
}
