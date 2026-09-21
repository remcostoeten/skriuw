import { BUILTIN_THEMES } from "@skriuw/theme";

export type ThemeVariant = {
  id: string;
  label: string;
  swatchFrom: string;
  swatchTo: string;
};

export type ThemeEntry = {
  id: string;
  label: string;
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
        swatchFrom: theme.swatchFrom,
        swatchTo: theme.swatchTo,
      });
      continue;
    }
    const variant = {
      id: theme.id,
      label: theme.label,
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
