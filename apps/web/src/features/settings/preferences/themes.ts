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
		label: "Mocha",
		swatchFrom: "hsl(25 20% 7%)",
		swatchTo: "hsl(28 16% 25%)",
	},
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_IDS = THEMES.map((theme) => theme.id) as readonly ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
	return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}
