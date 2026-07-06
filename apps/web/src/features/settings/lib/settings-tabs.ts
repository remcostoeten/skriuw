import { isTauriRuntime } from "@/core/workspace-backend";

export type SettingsTabId =
	| "account"
	| "appearance"
	| "editor"
	| "shortcuts"
	| "quick-access"
	| "data"
	| "privacy"
	| "security"
	| "ai"
	| "tags"
	| "experimental";

// Cloud-only tabs hidden in the desktop build: there is no cloud auth (account/
// security). AI stays visible — desktop runs local Ollama or a direct cloud key.
export const DESKTOP_HIDDEN_TABS: ReadonlySet<SettingsTabId> = new Set(["account", "security"]);

export function isSettingsTabVisible(id: SettingsTabId): boolean {
	return !(isTauriRuntime() && DESKTOP_HIDDEN_TABS.has(id));
}

export const SETTINGS_TABPANEL_ID = "settings-tabpanel";

export function getSettingsTabId(id: SettingsTabId): string {
	return `settings-tab-${id}`;
}
