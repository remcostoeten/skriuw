import { EDITOR_FONTS } from "@/shared/lib/editor-fonts";
import type { CommandPaletteItem } from "@/shared/ui/command-palette";
import { THEMES } from "@/features/settings/preferences/themes";
import { SETTINGS_FOCUS_PARAM } from "@/features/settings/lib/settings-focus-anchor";
import {
	isSettingsTabVisible,
	type SettingsTabId,
} from "@/features/settings/lib/settings-tabs";

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

function buildSettingsHref(tab: SettingsTabId, focusId: string): string {
	const params = new URLSearchParams({ tab, [SETTINGS_FOCUS_PARAM]: focusId });
	return `/app/settings?${params.toString()}`;
}

/**
 * Builds palette items for every visible individual setting. `searchOnly` keeps
 * them out of the idle palette — they appear when searched or under the `!s`
 * bang. `navigate` deep-links to the setting and the page flashes it on arrival.
 */
export function buildSettingsCommandItems(
	navigate: (href: string) => void,
): CommandPaletteItem[] {
	return SETTINGS_COMMAND_ENTRIES.filter((entry) => isSettingsTabVisible(entry.tab)).map(
		(entry) => ({
			id: `setting:${entry.id}`,
			label: entry.label,
			group: "Settings",
			hint: entry.hint,
			keywords: ["settings", ...entry.keywords],
			searchOnly: true,
			action: () => navigate(buildSettingsHref(entry.tab, entry.focusId)),
		}),
	);
}
