export const SCOPES = {
	userMenu: "user-menu",
	notes: "notes",
	journal: "journal",
	app: "app",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];
