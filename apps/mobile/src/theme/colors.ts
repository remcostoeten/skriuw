// App-surface colors now live in the theme system (theme/tokens.ts + useTheme),
// which mirrors the web design tokens across all themes. This file keeps only
// the auth-drawer surface, which is deliberately its own fixed palette.

/** Surface tokens mirroring @remcostoeten/auth-drawer's dark theme *as Skriuw
 *  renders it* — the package's `--overlay-*` HSL tokens resolved to hex/rgba,
 *  with the `#auth-drawer-portal` overrides from globals.css folded in (soft
 *  translucent controls, near-invisible input borders). Keeps the native auth
 *  screen of a piece with the web sign-in drawer. */
export const authSurface = {
	bg: "#0a0a0a",
	card: "#111111",
	cardBorder: "rgba(255,255,255,0.10)",

	controlBg: "rgba(255,255,255,0.03)",
	controlBgPressed: "rgba(255,255,255,0.05)",
	controlBorder: "rgba(255,255,255,0.08)",
	controlBorderPressed: "rgba(255,255,255,0.12)",

	inputBg: "transparent",
	inputBorder: "rgba(255,255,255,0.07)",
	inputBorderFocus: "rgba(255,255,255,0.11)",

	checkboxBorder: "rgba(255,255,255,0.20)",
	checkboxBorderHover: "rgba(255,255,255,0.40)",

	chipBg: "rgba(255,255,255,0.045)",
	chipBorder: "rgba(255,255,255,0.12)",

	divider: "rgba(255,255,255,0.20)",
	text: "#f5f5f5",
	textMuted: "#b8b8b8",
	textSubtle: "#7a7a7a",
	primary: "#f5f5f5",
	onPrimary: "#0a0a0a",
	error: "#f08a8a",
	errorBorder: "rgba(240,138,138,0.30)",
} as const;

/** Geometry the drawer settles on: 44px controls, 8px-rounded buttons (the
 *  package ships them square; Skriuw rounds them in globals.css) and square
 *  inputs, capped at the drawer's 448px panel width. */
export const authMetrics = {
	controlHeight: 44,
	buttonRadius: 8,
	inputRadius: 0,
	maxWidth: 448,
} as const;
