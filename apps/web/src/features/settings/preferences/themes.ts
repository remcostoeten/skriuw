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
		label: "Catppuccin Mocha",
		swatchFrom: "hsl(240 21% 15%)",
		swatchTo: "hsl(267 84% 81%)",
	},
	{
		id: "rose-pine",
		label: "Rosé Pine",
		swatchFrom: "hsl(249 22% 12%)",
		swatchTo: "hsl(2 55% 83%)",
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
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_IDS = THEMES.map((theme) => theme.id) as readonly ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
	return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}
