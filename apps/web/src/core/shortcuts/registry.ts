import { SCOPES } from "./scopes";

export const SHORTCUT_REGISTRY = {
	profile: { id: "profile", key: "p", scope: SCOPES.userMenu, description: "Open profile" },
	notes: { id: "notes", key: "n", scope: SCOPES.userMenu, description: "Open notes" },
	journal: { id: "journal", key: "j", scope: SCOPES.userMenu, description: "Open journal" },
	activity: { id: "activity", key: "a", scope: SCOPES.userMenu, description: "Open activity" },
	settings: {
		id: "settings",
		key: "meta+,",
		scope: SCOPES.userMenu,
		description: "Open settings",
	},
	signOut: { id: "signOut", key: "meta+delete", scope: SCOPES.userMenu, description: "Sign out" },
} as const;

export type ShortcutId = keyof typeof SHORTCUT_REGISTRY;
