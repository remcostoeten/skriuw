// Native theme tokens, mirroring the web design system so the two apps read as
// one product. Each theme's values are the exact HSL triples from the matching
// web theme file (apps/web/src/app/themes/*.css); `resolve()` wraps them in the
// `hsl()` strings React Native's color parser understands. To add a theme, drop
// in another raw-triple block below — no other file needs to change.

/** A single theme's colors, expressed as web-style "H S% L%" triples. */
type TRawTheme = {
	isDark: boolean;
	background: string;
	foreground: string;
	card: string;
	cardForeground: string;
	popover: string;
	popoverForeground: string;
	primary: string;
	primaryForeground: string;
	secondary: string;
	secondaryForeground: string;
	muted: string;
	mutedForeground: string;
	accent: string;
	accentForeground: string;
	destructive: string;
	success: string;
	warning: string;
	border: string;
	input: string;
	ring: string;
	bgDeep: string;
	bgHover: string;
	bgActive: string;
	textDim: string;
	textSecondary: string;
	divider: string;
	toolbar: string;
	iconRail: string;
	link: string;
	noteLink: string;
	tag: string;
	person: string;
};

const RAW: Record<string, TRawTheme> = {
	midnight: {
		isDark: true,
		background: "2 0% 7%",
		foreground: "0 0% 91%",
		card: "0 0% 9%",
		cardForeground: "0 0% 91%",
		popover: "0 0% 7%",
		popoverForeground: "0 0% 85%",
		primary: "0 0% 25%",
		primaryForeground: "0 0% 91%",
		secondary: "0 0% 15%",
		secondaryForeground: "0 0% 85%",
		muted: "0 0% 18%",
		mutedForeground: "0 0% 55%",
		accent: "0 0% 15%",
		accentForeground: "0 0% 91%",
		destructive: "348 50% 32%",
		success: "142 64% 48%",
		warning: "38 92% 50%",
		border: "0 0% 18%",
		input: "0 0% 18%",
		ring: "0 0% 14%",
		bgDeep: "0 0% 5%",
		bgHover: "0 0% 15%",
		bgActive: "0 0% 18%",
		textDim: "0 0% 40%",
		textSecondary: "0 0% 55%",
		divider: "0 0% 15%",
		toolbar: "0 0% 9%",
		iconRail: "0 0% 9%",
		link: "205 92% 72%",
		noteLink: "154 72% 66%",
		tag: "154 72% 66%",
		person: "330 81% 60%",
	},
	mocha: {
		isDark: true,
		background: "240 21% 12%",
		foreground: "226 64% 88%",
		card: "240 21% 15%",
		cardForeground: "226 64% 88%",
		popover: "240 21% 12%",
		popoverForeground: "227 35% 80%",
		primary: "267 84% 81%",
		primaryForeground: "240 23% 9%",
		secondary: "237 16% 23%",
		secondaryForeground: "227 35% 80%",
		muted: "237 16% 23%",
		mutedForeground: "230 13% 55%",
		accent: "234 13% 31%",
		accentForeground: "226 64% 88%",
		destructive: "343 81% 75%",
		success: "115 54% 76%",
		warning: "41 86% 83%",
		border: "234 13% 31%",
		input: "234 13% 31%",
		ring: "267 84% 81%",
		bgDeep: "240 23% 9%",
		bgHover: "237 16% 23%",
		bgActive: "234 13% 31%",
		textDim: "231 11% 47%",
		textSecondary: "230 13% 55%",
		divider: "237 16% 23%",
		toolbar: "240 21% 12%",
		iconRail: "240 21% 12%",
		link: "217 92% 76%",
		noteLink: "115 54% 76%",
		tag: "115 54% 76%",
		person: "316 72% 86%",
	},
	paper: {
		isDark: false,
		background: "40 16% 95%",
		foreground: "30 10% 14%",
		card: "40 18% 97%",
		cardForeground: "30 10% 14%",
		popover: "40 16% 95%",
		popoverForeground: "30 10% 18%",
		primary: "30 10% 20%",
		primaryForeground: "40 18% 96%",
		secondary: "40 14% 88%",
		secondaryForeground: "30 10% 18%",
		muted: "40 14% 90%",
		mutedForeground: "30 8% 38%",
		accent: "40 14% 88%",
		accentForeground: "30 10% 18%",
		destructive: "348 55% 35%",
		success: "146 58% 34%",
		warning: "34 88% 42%",
		border: "40 12% 82%",
		input: "40 12% 82%",
		ring: "40 12% 58%",
		bgDeep: "40 18% 94%",
		bgHover: "40 14% 90%",
		bgActive: "40 14% 86%",
		textDim: "30 8% 50%",
		textSecondary: "30 8% 38%",
		divider: "40 12% 84%",
		toolbar: "40 16% 95%",
		iconRail: "40 16% 95%",
		link: "213 72% 46%",
		noteLink: "154 58% 34%",
		tag: "154 58% 34%",
		person: "328 62% 48%",
	},
};

function toHsl(triple: string): string {
	const [h, s, l] = triple.split(" ");
	return `hsl(${h}, ${s}, ${l})`;
}

/** A theme with every color resolved to an `hsl()` string RN can render. */
export type TTheme = { [K in keyof TRawTheme]: TRawTheme[K] extends boolean ? boolean : string } & {
	radius: number;
};

function resolve(raw: TRawTheme): TTheme {
	const out = { radius: 6 } as TTheme;
	for (const key of Object.keys(raw) as Array<keyof TRawTheme>) {
		const value = raw[key];
		// @ts-expect-error narrowed per-key: isDark stays boolean, colors become strings
		out[key] = typeof value === "boolean" ? value : toHsl(value);
	}
	return out;
}

export type TThemeName = keyof typeof RAW;

export const themes: Record<TThemeName, TTheme> = Object.fromEntries(
	(Object.keys(RAW) as TThemeName[]).map((name) => [name, resolve(RAW[name])]),
) as Record<TThemeName, TTheme>;

/** Display metadata for the theme picker, in menu order. */
export const themeList: Array<{ name: TThemeName; label: string }> = [
	{ name: "midnight", label: "Midnight" },
	{ name: "mocha", label: "Mocha" },
	{ name: "paper", label: "Paper" },
];

export const DEFAULT_THEME: TThemeName = "midnight";
