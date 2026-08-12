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

export const THEMES = [
  {
    id: "midnight",
    label: "Skriuw",
    swatchFrom: "hsl(2 0% 7%)",
    swatchTo: "hsl(0 0% 15%)",
  },
  {
    id: "paper",
    label: "Paper",
    swatchFrom: "hsl(40 18% 96%)",
    swatchTo: "hsl(40 14% 88%)",
  },
  {
    id: "embers",
    label: "Embers",
    swatchFrom: "hsl(20 15% 9%)",
    swatchTo: "hsl(25 12% 22%)",
  },
  {
    id: "mocha",
    label: "Catppuccin",
    swatchFrom: "hsl(240 21% 15%)",
    swatchTo: "hsl(267 84% 81%)",
    variants: [
      {
        id: "mocha",
        label: "Mocha",
        swatchFrom: "hsl(240 21% 15%)",
        swatchTo: "hsl(267 84% 81%)",
      },
      {
        id: "catppuccin-latte",
        label: "Latte",
        swatchFrom: "hsl(220 23% 95%)",
        swatchTo: "hsl(267 83% 58%)",
      },
    ],
  },
  {
    id: "rose-pine",
    label: "Rosé Pine",
    swatchFrom: "hsl(249 22% 12%)",
    swatchTo: "hsl(2 55% 83%)",
    variants: [
      {
        id: "rose-pine",
        label: "Dusk",
        swatchFrom: "hsl(249 22% 12%)",
        swatchTo: "hsl(2 55% 83%)",
      },
      {
        id: "rose-pine-dawn",
        label: "Dawn",
        swatchFrom: "hsl(35 30% 95%)",
        swatchTo: "hsl(2 55% 67%)",
      },
    ],
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    swatchFrom: "hsl(0 0% 16%)",
    swatchTo: "hsl(35 87% 55%)",
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    swatchFrom: "hsl(235 22% 12%)",
    swatchTo: "hsl(221 74% 74%)",
  },
] as const satisfies readonly ThemeEntry[];

export const THEME_ENTRIES: readonly ThemeEntry[] = THEMES;

export function activeThemeIndex(theme: string): number {
  return Math.max(
    0,
    THEME_ENTRIES.findIndex(
      (entry) =>
        entry.id === theme ||
        ("variants" in entry && entry.variants?.some((variant) => variant.id === theme)),
    ),
  );
}

export function isVariantActive(entry: ThemeEntry, theme: string): boolean {
  return entry.variants?.some((variant) => variant.id === theme) ?? false;
}
