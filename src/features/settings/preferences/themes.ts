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

export const ACCENTS = [
	{ id: "violet", label: "Violet", value: "hsl(var(--project-purple))" },
	{ id: "blue", label: "Blue", value: "hsl(var(--project-blue))" },
	{ id: "green", label: "Green", value: "hsl(var(--project-green))" },
	{ id: "amber", label: "Amber", value: "hsl(var(--project-amber))" },
	{ id: "pink", label: "Pink", value: "hsl(var(--project-pink))" },
	{ id: "red", label: "Red", value: "hsl(var(--project-red))" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export const DEFAULT_ACCENT_ID: AccentId = "violet";

export function isAccentId(value: unknown): value is AccentId {
	return typeof value === "string" && ACCENTS.some((accent) => accent.id === value);
}
