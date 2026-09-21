export type ThemeColorScheme = "light" | "dark";

export type ThemeFamily = {
  id: string;
  label: string;
};

export type BuiltinThemeMetadata = {
  id: string;
  label: string;
  colorScheme: ThemeColorScheme;
  swatchFrom: string;
  swatchTo: string;
  family?: ThemeFamily;
};

export const BUILTIN_THEMES = [
  {
    id: "midnight",
    label: "Skriuw",
    colorScheme: "dark",
    swatchFrom: "hsl(2 0% 7%)",
    swatchTo: "hsl(0 0% 15%)",
  },
  {
    id: "paper",
    label: "Paper",
    colorScheme: "light",
    swatchFrom: "hsl(40 18% 96%)",
    swatchTo: "hsl(40 14% 88%)",
  },
  {
    id: "embers",
    label: "Embers",
    colorScheme: "dark",
    swatchFrom: "hsl(20 15% 9%)",
    swatchTo: "hsl(25 12% 22%)",
  },
  {
    id: "mocha",
    label: "Mocha",
    colorScheme: "dark",
    swatchFrom: "hsl(240 21% 15%)",
    swatchTo: "hsl(267 84% 81%)",
    family: { id: "catppuccin", label: "Catppuccin" },
  },
  {
    id: "catppuccin-latte",
    label: "Latte",
    colorScheme: "light",
    swatchFrom: "hsl(220 23% 95%)",
    swatchTo: "hsl(267 83% 58%)",
    family: { id: "catppuccin", label: "Catppuccin" },
  },
  {
    id: "rose-pine",
    label: "Dusk",
    colorScheme: "dark",
    swatchFrom: "hsl(249 22% 12%)",
    swatchTo: "hsl(2 55% 83%)",
    family: { id: "rose-pine", label: "Rosé Pine" },
  },
  {
    id: "rose-pine-dawn",
    label: "Dawn",
    colorScheme: "light",
    swatchFrom: "hsl(35 30% 95%)",
    swatchTo: "hsl(2 55% 67%)",
    family: { id: "rose-pine", label: "Rosé Pine" },
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    colorScheme: "dark",
    swatchFrom: "hsl(0 0% 16%)",
    swatchTo: "hsl(35 87% 55%)",
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    colorScheme: "dark",
    swatchFrom: "hsl(235 22% 12%)",
    swatchTo: "hsl(221 74% 74%)",
  },
] as const satisfies readonly BuiltinThemeMetadata[];
