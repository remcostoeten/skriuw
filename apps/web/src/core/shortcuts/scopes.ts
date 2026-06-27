export const SCOPES = {
	userMenu: "user-menu",
	notes: "notes",
	journal: "journal",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];
