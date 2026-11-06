export const PALETTE_DENSITY_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "spacious", label: "Spacious" },
] as const;

export type PaletteDensity = (typeof PALETTE_DENSITY_OPTIONS)[number]["value"];

export const PALETTE_SIZE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "roomy", label: "Roomy" },
  { value: "large", label: "Large" },
] as const;

export type PaletteSize = (typeof PALETTE_SIZE_OPTIONS)[number]["value"];
