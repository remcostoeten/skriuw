// App-surface colors now live in the theme system (theme/tokens.ts + useTheme),
// which mirrors the web design tokens across all themes. This file keeps only
// the auth-drawer surface, which is deliberately its own fixed palette.

/** Surface tokens mirroring @remcostoeten/auth-drawer's dark theme, so the
 *  native auth screen feels of a piece with the web sign-in drawer. Values map
 *  the package's `--overlay-*` HSL tokens (dark mode) to hex/rgba. */
export const authSurface = {
	bg: "#0a0a0a",
	card: "#111111",
	cardBorder: "rgba(255,255,255,0.10)",
	inputBg: "transparent",
	border: "rgba(255,255,255,0.20)",
	borderFocus: "rgba(255,255,255,0.50)",
	divider: "rgba(255,255,255,0.10)",
	text: "#f5f5f5",
	textMuted: "#b8b8b8",
	textSubtle: "#7a7a7a",
	primary: "#f5f5f5",
	onPrimary: "#0a0a0a",
	error: "#f08a8a",
} as const;
