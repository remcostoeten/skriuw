import { EDITOR_FONTS } from "@/shared/lib/editor-fonts";
import type { CommandPaletteItem } from "@/shared/ui/command-palette";
import { THEMES } from "@/features/settings/preferences/themes";
import { usePreferencesStore } from "@/features/settings/store";
import { openSettings } from "@/features/settings/use-settings-modal";
import { isSettingsTabVisible, type SettingsTabId } from "@/features/settings/lib/settings-tabs";

type SettingsCommandEntry = {
	id: string;
	label: string;
	tab: SettingsTabId;
	focusId: string;
	keywords: string[];
	hint?: string;
};

const FONT_KEYWORDS = EDITOR_FONTS.map((font) => font.label.toLowerCase());
const THEME_KEYWORDS = THEMES.map((theme) => theme.label.toLowerCase());

/**
 * Individual, deep-linkable settings surfaced in the command palette. Each
 * entry jumps to its section and flashes the exact control. Extend this list to
 * index more settings — the palette, `!s` bang, and deep-link focus all read
 * from here.
 */
const SETTINGS_COMMAND_ENTRIES: ReadonlyArray<SettingsCommandEntry> = [
	{
		id: "theme",
		label: "Theme",
		tab: "appearance",
		focusId: "theme",
		keywords: ["theme", "appearance", "color", "dark", "light", ...THEME_KEYWORDS],
		hint: "Appearance",
	},
	{
		id: "compact-sidebar",
		label: "Compact sidebar",
		tab: "appearance",
		focusId: "compact-sidebar",
		keywords: ["compact", "sidebar", "density", "spacing"],
		hint: "Appearance",
	},
	{
		id: "tree-guides",
		label: "File tree guide lines",
		tab: "appearance",
		focusId: "tree-guides",
		keywords: ["tree", "guides", "ruler", "lines", "sidebar"],
		hint: "Appearance",
	},
	{
		id: "line-numbers",
		label: "Show line numbers",
		tab: "appearance",
		focusId: "line-numbers",
		keywords: ["line", "numbers", "gutter"],
		hint: "Appearance",
	},
	{
		id: "reduce-motion",
		label: "Reduce motion",
		tab: "appearance",
		focusId: "reduce-motion",
		keywords: ["reduce", "motion", "animation", "transitions", "accessibility"],
		hint: "Appearance",
	},
	{
		id: "editor-font",
		label: "Editor font",
		tab: "editor",
		focusId: "editor-font",
		keywords: ["font", "typeface", "typography", ...FONT_KEYWORDS],
		hint: "Editor",
	},
	{
		id: "line-height",
		label: "Line height",
		tab: "editor",
		focusId: "line-height",
		keywords: ["line", "height", "spacing", "leading"],
		hint: "Editor",
	},
	{
		id: "vim-mode",
		label: "Vim mode",
		tab: "editor",
		focusId: "vim-mode",
		keywords: ["vim", "modal", "keybindings", "normal", "insert"],
		hint: "Editor",
	},
	{
		id: "raw-mdx",
		label: "Default to Raw MDX",
		tab: "editor",
		focusId: "raw-mdx",
		keywords: ["raw", "mdx", "markdown", "editor", "mode"],
		hint: "Editor",
	},
	{
		id: "open-in-tabs",
		label: "Open notes in tabs",
		tab: "editor",
		focusId: "open-in-tabs",
		keywords: ["tabs", "open", "notes", "workspace"],
		hint: "Editor",
	},
	{
		id: "detect-tags-in-text",
		label: "Detect #tags in note text",
		tab: "editor",
		focusId: "detect-tags-in-text",
		keywords: ["tags", "detect", "hashtag", "parse", "auto", "code", "env"],
		hint: "Editor",
	},
	{
		id: "shortcuts",
		label: "Keyboard shortcuts",
		tab: "shortcuts",
		focusId: "shortcuts",
		keywords: ["shortcuts", "keyboard", "keybindings", "hotkeys"],
		hint: "Shortcuts",
	},
	{
		id: "backup-sync",
		label: "Backup & sync",
		tab: "data",
		focusId: "backup-sync",
		keywords: ["backup", "sync", "export", "import", "download", "restore", "data"],
		hint: "Data & sync",
	},
	{
		id: "ai-keys",
		label: "AI providers & keys",
		tab: "ai",
		focusId: "ai-keys",
		keywords: ["ai", "api", "keys", "openai", "groq", "gemini", "ollama", "provider"],
		hint: "AI",
	},
	{
		id: "tags",
		label: "Manage tags",
		tab: "tags",
		focusId: "tags",
		keywords: ["tags", "labels", "manage"],
		hint: "Tags",
	},
	{
		id: "privacy",
		label: "Privacy & analytics",
		tab: "privacy",
		focusId: "privacy",
		keywords: ["privacy", "analytics", "tracking", "data use"],
		hint: "Privacy",
	},
];

/**
 * Finds the deep-link focus target on `tab` that best matches a free-text
 * search query. Used by the settings sidebar search so pressing Enter can
 * flash the exact control, not just switch tabs.
 */
export function findSettingsFocusId(query: string, tab: SettingsTabId): string | null {
	const indexed = bestSettingsMatch(query, tab);
	if (indexed) return indexed.focusId;

	const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;
	const match = SETTINGS_COMMAND_ENTRIES.find(
		(entry) =>
			entry.tab === tab &&
			tokens.every(
				(token) =>
					entry.label.toLowerCase().includes(token) ||
					entry.keywords.some((keyword) => keyword.includes(token)),
			),
	);
	return match?.focusId ?? null;
}

type SettingsSearchEntry = {
	tab: SettingsTabId;
	focusId: string;
	title: string;
	description: string;
	keywords: string;
};

/**
 * Full-text index of every individual setting's title + subtitle across all
 * sections, each pinned to a DOM scroll anchor (`focusId`). Powers the settings
 * search: matching resolves the exact control to scroll to and flash. Keep in
 * sync with the `focusId`/`title`/`description` rendered by each section.
 */
export const SETTINGS_SEARCH_INDEX: ReadonlyArray<SettingsSearchEntry> = [
	{
		tab: "appearance",
		focusId: "theme",
		title: "Theme",
		description: "",
		keywords:
			"midnight paper embers mocha catppuccin rose pine gruvbox tokyo night dark light color scheme swatch",
	},
	{
		tab: "appearance",
		focusId: "compact-sidebar",
		title: "Compact sidebar",
		description: "Tighter spacing in the file tree.",
		keywords: "density spacing tree",
	},
	{
		tab: "appearance",
		focusId: "tree-guides",
		title: "File tree guide lines",
		description: "Show nested ruler lines in the notes sidebar.",
		keywords: "ruler lines nesting indent",
	},
	{
		tab: "appearance",
		focusId: "line-numbers",
		title: "Show line numbers",
		description: "In the editor gutter.",
		keywords: "gutter",
	},
	{
		tab: "appearance",
		focusId: "reduce-motion",
		title: "Reduce motion",
		description: "Minimize transitions and animations.",
		keywords: "animation accessibility motion",
	},
	{
		tab: "appearance",
		focusId: "remember-last-tab",
		title: "Remember last settings tab",
		description: "Reopen settings on the tab you last visited instead of the default.",
		keywords: "reopen persist last tab",
	},
	{
		tab: "appearance",
		focusId: "remember-last-note",
		title: "Remember last opened note",
		description: "Reopen the note you last viewed on launch instead of the first note.",
		keywords: "reopen persist last note restore launch relaunch",
	},

	{
		tab: "privacy",
		focusId: "usage-analytics",
		title: "Usage analytics",
		description:
			"Anonymous page views and product events while you browse. On by default for accounts — turn off to opt out. No note content, no cookies. Sign-in events are recorded separately on the server.",
		keywords: "telemetry tracking opt out anonymous events analytics",
	},

	{
		tab: "experimental",
		focusId: "diary-view",
		title: "Diary view",
		description: "Enable a layout optimized for chronological journaling.",
		keywords: "journal diary chronological beta preview new-note",
	},

	{
		tab: "account",
		focusId: "display-name",
		title: "Display name",
		description: "Shown on shared notes and comments.",
		keywords: "name profile handle full name",
	},
	{
		tab: "account",
		focusId: "username",
		title: "Username",
		description:
			"Used for collaboration invites. Letters, numbers, underscores, and dots only.",
		keywords: "handle collaboration invite login",
	},
	{
		tab: "account",
		focusId: "email",
		title: "Email",
		description: "Used for sign-in and account recovery.",
		keywords: "email address sign-in recovery contact",
	},
	{
		tab: "account",
		focusId: "shared-notes",
		title: "Shared notes",
		description: "Manage every public link and see view activity.",
		keywords: "sharing public links views overview",
	},
	{
		tab: "account",
		focusId: "sign-out",
		title: "Sign out",
		description: "End your session on this device.",
		keywords: "logout log out session leave",
	},
	{
		tab: "account",
		focusId: "delete-account",
		title: "Delete account",
		description: "Permanently remove your account and notes.",
		keywords: "remove close account danger delete erase",
	},

	{
		tab: "security",
		focusId: "change-password",
		title: "Change password",
		description: "Update your sign-in password.",
		keywords: "reset credentials new password sign-in login",
	},

	{
		tab: "editor",
		focusId: "editor-font",
		title: "Default font",
		description: "Choose a typeface for the rich text editor.",
		keywords:
			"typeface family sans serif mono monospace Inter Lora Source Serif Merriweather Libre Baskerville Sohne iA Writer Quattro JetBrains Mono Fira Code",
	},
	{
		tab: "editor",
		focusId: "line-height",
		title: "Line height",
		description: "Spacing between lines while you write.",
		keywords: "leading line spacing density",
	},
	{
		tab: "editor",
		focusId: "raw-mdx",
		title: "Default to Raw MDX",
		description: "New notes open in raw MDX mode.",
		keywords: "markdown source plain text markup",
	},
	{
		tab: "editor",
		focusId: "animated-numbers",
		title: "Animated numbers",
		description: "Animate changing counts in the inspector and status bar.",
		keywords: "count animation transition inspector status bar motion",
	},
	{
		tab: "editor",
		focusId: "vim-mode",
		title: "Vim mode",
		description:
			"Modal editing with Normal and Insert modes (h/j/k/l, w/b/e, dd, x, i/a/o, and more). Press Esc for Normal mode.",
		keywords: "modal normal insert hjkl keybindings vi motions",
	},
	{
		tab: "editor",
		focusId: "open-in-tabs",
		title: "Open notes in tabs",
		description: "Keep opened notes in a tab bar instead of replacing the current note.",
		keywords: "tabs tabbed workspace tab bar multiple notes",
	},
	{
		tab: "editor",
		focusId: "detect-tags-in-text",
		title: "Detect #tags in note text",
		description:
			"Turn #words written in plain text into workspace tags. Disable if your notes contain code comments or .env snippets — tags inserted via the # menu keep working either way.",
		keywords: "hashtag tags autodetect inline tagging pound",
	},

	{
		tab: "shortcuts",
		focusId: "reset-all-to-defaults",
		title: "Reset all to defaults",
		description: "Rebind keyboard shortcuts. Changes are saved to this device.",
		keywords: "reset all defaults restore revert clear overrides keybindings shortcuts",
	},
	{
		tab: "shortcuts",
		focusId: "group-general",
		title: "General",
		description: "",
		keywords:
			"open command palette open settings open shortcut help toggle sidebar toggle settings focus switch editor mode focus editor",
	},
	{
		tab: "shortcuts",
		focusId: "group-notes",
		title: "Notes",
		description: "",
		keywords:
			"create note create folder toggle sidebar toggle note details switch editor mode focus file tree toggle split editor split horizontally close tab close split pane focus next split pane focus previous split pane go to tab last tab focus editor focus sidebar search",
	},
	{
		tab: "shortcuts",
		focusId: "group-journal",
		title: "Journal",
		description: "",
		keywords: "journal shortcuts",
	},
	{
		tab: "shortcuts",
		focusId: "group-editor-search",
		title: "Editor search",
		description: "",
		keywords:
			"find in note toggle match case whole word regular expression regex search editor",
	},
	{
		tab: "shortcuts",
		focusId: "group-user-menu",
		title: "User menu",
		description: "",
		keywords: "open profile go to notes journal activity sign out logout user menu",
	},

	{
		tab: "data",
		focusId: "backup-sync",
		title: "Export notes",
		description:
			"Download notes, folders, journal entries, tags, and optional version history as a Skriuw v3 ZIP.",
		keywords: "backup download export zip archive versions",
	},
	{
		tab: "data",
		focusId: "import-backup",
		title: "Import backup",
		description:
			"Import a Skriuw backup or Markdown folder ZIP. Choose merge, overwrite, or full workspace replace.",
		keywords:
			"restore upload zip markdown obsidian notion bear apple notes merge overwrite replace",
	},
	{
		tab: "data",
		focusId: "desktop-sync",
		title: "Desktop sync",
		description: "Create a scoped token so the desktop app can pull your cloud workspace.",
		keywords: "token api key pull scoped tokens revoke create desktop app",
	},
	{
		tab: "data",
		focusId: "reset-demo-workspace",
		title: "Reset demo workspace",
		description:
			"Clear your local demo edits and restore the original seeded workspace. This cannot be undone.",
		keywords: "guest seed restore clear demo",
	},
	{
		tab: "data",
		focusId: "clear-all-data",
		title: "Clear all data",
		description:
			"Permanently delete all notes, folders, journal entries, and tags. Account and AI keys are kept.",
		keywords: "delete wipe erase danger zone remove",
	},
	{
		tab: "data",
		focusId: "local-vault-directory",
		title: "Vault directory",
		description: "",
		keywords: "folder path storage location open reveal change move vault",
	},
	{
		tab: "data",
		focusId: "local-pull-from-server",
		title: "Pull from server",
		description:
			"Download your cloud workspace into this device. One-way: it never uploads local changes.",
		keywords: "cloud sync download server url token one-way desktop",
	},
	{
		tab: "data",
		focusId: "local-back-up-vault",
		title: "Back up vault",
		description: "Save a .zip of every note and folder.",
		keywords: "backup export zip download archive",
	},
	{
		tab: "data",
		focusId: "local-restore-from-backup",
		title: "Restore from backup",
		description: "Replace the current vault with a .zip backup.",
		keywords: "import upload zip restore replace",
	},
	{
		tab: "data",
		focusId: "local-complete-snapshot",
		title: "Complete snapshot",
		description: "Capture settings, the SQLite index, the vault, and local AI data.",
		keywords: "full backup snapshot export restore sqlite ai settings state",
	},
	{
		tab: "data",
		focusId: "local-import-from-simplenote",
		title: "Import from Simplenote",
		description:
			"Pick your Simplenote export .zip. Notes, tags, and original dates are added to your vault.",
		keywords: "simplenote migration import zip tags trash ai titles",
	},
	{
		tab: "data",
		focusId: "local-reset-app",
		title: "Reset app",
		description: "Permanently remove app data, local AI data, and the vault.",
		keywords: "wipe delete erase danger zone factory reset desktop",
	},

	{
		tab: "ai",
		focusId: "model",
		title: "Preferred model",
		description: "Applied to all AI actions — spell check, continue writing, title generation.",
		keywords:
			"model provider google groq gemini flash pro llama llama3 llama-3 qwen mistral gemma gemma2 phi deepseek 70b 8b gpt openai inference recommended",
	},
	{
		tab: "ai",
		focusId: "translate-language",
		title: "Translate target language",
		description: "Used by the Translate selection action in the editor toolbar.",
		keywords: "translate language target english dutch german french spanish auto locale",
	},
	{
		tab: "ai",
		focusId: "local-keys",
		title: "Local API keys",
		description:
			"Optional browser-stored keys for quick switching when a provider rate limits you.",
		keywords:
			"api key local browser stored token secret groq google gemini provider rate limit switch",
	},
	{
		tab: "ai",
		focusId: "keys-server",
		title: "Server keys",
		description:
			"User-owned provider keys stay encrypted server-side. Raw values are never shown after save.",
		keywords:
			"server key encrypted provider google groq gemini api token secret save rename test usage",
	},
	{
		tab: "ai",
		focusId: "desktop-provider",
		title: "AI provider",
		description: "Where title, spell-check, and continue-writing run.",
		keywords: "provider ollama local groq gemini cloud select desktop engine",
	},
	{
		tab: "ai",
		focusId: "desktop-ollama-runtime",
		title: "Ollama runtime",
		description: "One click downloads and starts it.",
		keywords:
			"ollama runtime install start local engine download binary running version desktop",
	},
	{
		tab: "ai",
		focusId: "desktop-active-model",
		title: "Active model",
		description: "The local model used for AI actions.",
		keywords:
			"active model local ollama llama llama3 qwen mistral gemma phi deepseek select desktop",
	},
	{
		tab: "ai",
		focusId: "desktop-models",
		title: "Models",
		description: "",
		keywords:
			"models catalog pull download install ollama llama llama3 qwen mistral gemma phi deepseek remove local desktop size",
	},
	{
		tab: "ai",
		focusId: "desktop-cloud-model",
		title: "Model",
		description: "Groq or Gemini model id (e.g. llama-3.3-70b-versatile).",
		keywords:
			"model id groq gemini llama 70b versatile gemini-2.5-flash cloud endpoint desktop",
	},
	{
		tab: "ai",
		focusId: "desktop-cloud-key",
		title: "API key",
		description: "Stored locally in settings.json on this device.",
		keywords: "api key groq gemini cloud token secret settings.json local device desktop save",
	},

	{
		tab: "tags",
		focusId: "manage-tags",
		title: "Manage Tags",
		description: "",
		keywords: "tags manage create new tag color rename delete remove usage hashtag organize",
	},
];

function settingsEntryHaystack(entry: SettingsSearchEntry): string {
	return `${entry.title} ${entry.description} ${entry.keywords}`.toLowerCase();
}

/**
 * The best-matching indexed setting on `tab` for a free-text query (every token
 * must appear in the entry's title/description/keywords), or null when nothing
 * on that tab matches.
 */
export function bestSettingsMatch(query: string, tab: SettingsTabId): SettingsSearchEntry | null {
	const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;
	return (
		SETTINGS_SEARCH_INDEX.find(
			(entry) =>
				entry.tab === tab &&
				tokens.every((token) => settingsEntryHaystack(entry).includes(token)),
		) ?? null
	);
}

/**
 * The first deep-linkable control in a tab, used as a scroll anchor when a
 * search matches a section by its description/label but not a specific control.
 */
export function firstSettingsFocusId(tab: SettingsTabId): string | null {
	return SETTINGS_COMMAND_ENTRIES.find((entry) => entry.tab === tab)?.focusId ?? null;
}

/**
 * Builds one palette item per theme so any theme can be applied directly from
 * Ctrl+K without opening the settings modal.
 */
export function buildThemeCommandItems(): CommandPaletteItem[] {
	const activeTheme = usePreferencesStore.getState().appearance.theme;
	return THEMES.map((theme) => ({
		id: `theme:${theme.id}`,
		label: `Theme: ${theme.label}`,
		group: "Theme",
		hint: theme.id === activeTheme ? "Active" : "Appearance",
		keywords: ["theme", "appearance", "color", theme.label.toLowerCase(), theme.id],
		searchOnly: true,
		action: () => usePreferencesStore.getState().updateAppearancePreference("theme", theme.id),
	}));
}

/**
 * Builds palette items for every visible individual setting. `searchOnly` keeps
 * them out of the idle palette — they appear when searched or under the `!s`
 * bang. Selecting one opens the settings modal on its tab and flashes the exact
 * control.
 */
export function buildSettingsCommandItems(): CommandPaletteItem[] {
	return SETTINGS_COMMAND_ENTRIES.filter((entry) => isSettingsTabVisible(entry.tab)).map(
		(entry) => ({
			id: `setting:${entry.id}`,
			label: entry.label,
			group: "Settings",
			hint: entry.hint,
			keywords: ["settings", ...entry.keywords],
			searchOnly: true,
			action: () => openSettings(entry.tab, entry.focusId),
		}),
	);
}
