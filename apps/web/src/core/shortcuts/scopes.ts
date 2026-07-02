export const SCOPES = {
	userMenu: "user-menu",
	notes: "notes",
	journal: "journal",
	app: "app",
	settings: "settings",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];
