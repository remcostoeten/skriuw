export const SCOPES = {
	userMenu: "user-menu",
	notes: "notes",
	journal: "journal",
	/** App-wide commands with no feature-scoped UI of their own (e.g. global shortcuts). */
	global: "global",
	app: "app",
	settings: "settings",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];
