export const THEMES = [
	{
		id: "midnight",
		label: "Midnight",
		swatchFrom: "hsl(2 0% 7%)",
		swatchTo: "hsl(0 0% 15%)",
	},
	{
		id: "graphite",
		label: "Graphite",
		swatchFrom: "hsl(220 6% 12%)",
		swatchTo: "hsl(220 6% 22%)",
	},
	{
		id: "paper",
		label: "Paper",
		swatchFrom: "hsl(40 18% 96%)",
		swatchTo: "hsl(40 14% 88%)",
	},
	{
		id: "monokai",
		label: "Monokai",
		swatchFrom: "hsl(70 8% 14%)",
		swatchTo: "hsl(54 100% 62%)",
	},
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_IDS = THEMES.map((theme) => theme.id) as readonly ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
	return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}
