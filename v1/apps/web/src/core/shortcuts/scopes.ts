export const SCOPES = {
	userMenu: "user-menu",
	notes: "notes",
	journal: "journal",
	/** Formatting shortcuts that apply to an open text-selection toolbar. */
	formatting: "formatting",
	/** Tool shortcuts that are available only while a drawing is being edited. */
	drawing: "drawing",
	/** App-wide commands with no feature-scoped UI of their own (e.g. global shortcuts). */
	global: "global",
	app: "app",
	settings: "settings",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];
