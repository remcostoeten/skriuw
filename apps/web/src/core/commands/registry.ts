import type { Scope } from "../shortcuts/scopes";
import type { ShortcutId } from "../shortcuts/registry";

export type CommandDefinition = {
	id: string;
	label: string;
	scope: Scope | "global";
	group: string;
	keywords?: string[];
	description?: string;
	shortcutId?: ShortcutId;
};

export const COMMAND_REGISTRY: Record<string, CommandDefinition> = {
	// =========================================================================
	// Notes Scope Commands
	// =========================================================================
	"notes.newNote": {
		id: "notes.newNote",
		label: "Create note",
		scope: "notes",
		group: "Notes",
		keywords: ["new", "file", "note", "create"],
		description: "Create a fresh note and focus it immediately.",
		shortcutId: "notes.newNote",
	},
	"notes.newFolder": {
		id: "notes.newFolder",
		label: "Create folder",
		scope: "notes",
		group: "Notes",
		keywords: ["folder", "create", "sidebar"],
		description: "Add a new folder to the current tree.",
		shortcutId: "notes.newFolder",
	},
	"notes.toggleSidebar": {
		id: "notes.toggleSidebar",
		label: "Toggle sidebar",
		scope: "notes",
		group: "Navigation",
		keywords: ["sidebar", "navigation", "panel"],
		description: "Show or hide the notes navigation panel.",
		shortcutId: "notes.toggleSidebar",
	},
	"notes.toggleMetadata": {
		id: "notes.toggleMetadata",
		label: "Toggle note details",
		scope: "notes",
		group: "Navigation",
		keywords: ["metadata", "details", "properties"],
		description: "Show or hide the metadata panel.",
		shortcutId: "notes.toggleMetadata",
	},
	"notes.toggleEditor": {
		id: "notes.toggleEditor",
		label: "Toggle editor surface",
		scope: "notes",
		group: "Editor",
		keywords: ["raw mdx", "block note", "editor"],
		description: "Swap between raw MDX and Block Note.",
		shortcutId: "notes.toggleEditor",
	},
	"notes.focusFileTree": {
		id: "notes.focusFileTree",
		label: "Focus file tree",
		scope: "notes",
		group: "Navigation",
		keywords: ["file tree", "sidebar", "focus", "notes"],
		description: "Move focus to the active note in the file tree.",
		shortcutId: "notes.focusFileTree",
	},
	"notes.toggleSplit": {
		id: "notes.toggleSplit",
		label: "Split editor vertically",
		scope: "notes",
		group: "Editor",
		keywords: ["split", "editor", "pane", "vertical"],
		description: "Open the neighboring note in a vertical split.",
		shortcutId: "notes.toggleSplit",
	},
	"notes.splitHorizontal": {
		id: "notes.splitHorizontal",
		label: "Split editor horizontally",
		scope: "notes",
		group: "Editor",
		keywords: ["split", "editor", "pane", "horizontal"],
		description: "Open or switch the split editor to a horizontal layout.",
		shortcutId: "notes.splitHorizontal",
	},
	"notes.closeTab": {
		id: "notes.closeTab",
		label: "Close tab",
		scope: "notes",
		group: "Editor",
		keywords: ["close", "tab", "note", "dismiss"],
		description: "Close the focused tab; the pane empties when it is the last one.",
		shortcutId: "notes.closeTab",
	},
	"notes.closeSplit": {
		id: "notes.closeSplit",
		label: "Close split pane",
		scope: "notes",
		group: "Editor",
		keywords: ["close", "split", "pane"],
		description: "Close the split editor pane.",
		shortcutId: "notes.closeSplit",
	},
	"notes.focusNextSplitPane": {
		id: "notes.focusNextSplitPane",
		label: "Focus next split pane",
		scope: "notes",
		group: "Editor",
		keywords: ["split", "editor", "pane", "focus", "next"],
		description: "Move focus clockwise through split editor panes.",
		shortcutId: "notes.focusNextSplitPane",
	},
	"notes.focusPreviousSplitPane": {
		id: "notes.focusPreviousSplitPane",
		label: "Focus previous split pane",
		scope: "notes",
		group: "Editor",
		keywords: ["split", "editor", "pane", "focus", "previous"],
		description: "Move focus counter-clockwise through split editor panes.",
		shortcutId: "notes.focusPreviousSplitPane",
	},
	"notes.focusEditor": {
		id: "notes.focusEditor",
		label: "Focus editor",
		scope: "notes",
		group: "Notes",
		keywords: ["focus", "editor", "type", "write"],
		description: "Jump the caret into the note body.",
		shortcutId: "notes.focusEditor",
	},
	"notes.focusSidebarSearch": {
		id: "notes.focusSidebarSearch",
		label: "Focus sidebar search",
		scope: "notes",
		group: "Notes",
		keywords: ["search", "sidebar", "find", "filter"],
		description: "Open the sidebar search field.",
		shortcutId: "notes.focusSidebarSearch",
	},
	"notes.help": {
		id: "notes.help",
		label: "Open shortcut help",
		scope: "notes",
		group: "Notes",
		keywords: ["help", "shortcuts", "keyboard"],
		description: "Open the keyboard shortcuts cheat sheet.",
		shortcutId: "notes.help",
	},
	"notes.closeOtherTabs": {
		id: "notes.closeOtherTabs",
		label: "Close other tabs",
		scope: "notes",
		group: "Editor",
		keywords: ["close", "tab", "note", "others", "except", "focused"],
		description: "Close every tab in the focused pane except the active one.",
	},
	"notes.closeAllTabs": {
		id: "notes.closeAllTabs",
		label: "Close all tabs",
		scope: "notes",
		group: "Editor",
		keywords: ["close", "tab", "note", "all", "empty"],
		description: "Close every tab in the focused pane (pinned tabs are kept).",
	},

	// =========================================================================
	// Journal Scope Commands
	// =========================================================================
	"journal.goToToday": {
		id: "journal.goToToday",
		label: "Jump to today",
		scope: "journal",
		group: "Navigation",
		keywords: ["journal", "today", "date"],
		description: "Return to today’s journal entry.",
	},
	"journal.toggleSidebar": {
		id: "journal.toggleSidebar",
		label: "Toggle sidebar",
		scope: "journal",
		group: "Navigation",
		keywords: ["sidebar", "calendar", "toggle"],
		description: "Show or hide the journal sidebar.",
		shortcutId: "journal.toggleSidebar",
	},
	"journal.backToList": {
		id: "journal.backToList",
		label: "Back to journal list",
		scope: "journal",
		group: "Navigation",
		keywords: ["journal", "list", "back", "entries"],
		description: "Return to the journal entries list.",
	},
	"journal.toggleEditor": {
		id: "journal.toggleEditor",
		label: "Switch editor mode",
		scope: "journal",
		group: "Editor",
		keywords: ["plain", "rich", "editor"],
		description: "Swap between plain text and rich text editing.",
		shortcutId: "journal.toggleEditor",
	},
	"journal.focusEditor": {
		id: "journal.focusEditor",
		label: "Focus editor",
		scope: "journal",
		group: "Journal",
		keywords: ["focus", "editor", "journal"],
		description: "Jump the caret into the journal entry.",
		shortcutId: "journal.focusEditor",
	},
	"journal.help": {
		id: "journal.help",
		label: "Open shortcut help",
		scope: "journal",
		group: "Journal",
		keywords: ["help", "shortcuts", "keyboard"],
		description: "Open the keyboard shortcuts cheat sheet.",
		shortcutId: "journal.help",
	},

	// =========================================================================
	// Global / Navigation Commands
	// =========================================================================
	"nav.notes": {
		id: "nav.notes",
		label: "Go to Notes",
		scope: "global",
		group: "Navigation",
		keywords: ["editor", "workspace", "notes"],
		shortcutId: "menu.notes",
	},
	"nav.journal": {
		id: "nav.journal",
		label: "Go to Journal",
		scope: "global",
		group: "Navigation",
		keywords: ["diary", "daily", "journal"],
		shortcutId: "menu.journal",
	},
	"nav.graph": {
		id: "nav.graph",
		label: "Go to Graph",
		scope: "global",
		group: "Navigation",
		keywords: ["links", "connections", "graph"],
	},
	"nav.shared": {
		id: "nav.shared",
		label: "Go to Shared",
		scope: "global",
		group: "Navigation",
		keywords: ["collaboration", "shared"],
	},
	"nav.trash": {
		id: "nav.trash",
		label: "Go to Trash",
		scope: "global",
		group: "Navigation",
		keywords: ["deleted", "bin", "trash"],
	},

	// =========================================================================
	// Settings / General Commands
	// =========================================================================
	"settings.open": {
		id: "settings.open",
		label: "Open Settings",
		scope: "global",
		group: "Settings",
		keywords: ["preferences", "config", "settings"],
		shortcutId: "app.settings",
	},
	"settings.theme": {
		id: "settings.theme",
		label: "Switch theme",
		scope: "global",
		group: "Settings",
		keywords: ["theme", "appearance", "color", "dark", "light", "switch", "cycle"],
		description: "Cycle to the next theme.",
	},
	"settings.vim": {
		id: "settings.vim",
		label: "Toggle Vim mode",
		scope: "global",
		group: "Editor",
		keywords: ["vim", "modal", "keybindings", "normal", "insert", "editor"],
		description: "Turn modal Vim keybindings on or off.",
	},
	"settings.welcomeTour": {
		id: "settings.welcomeTour",
		label: "Show welcome tour",
		scope: "global",
		group: "Help",
		keywords: ["tour", "walkthrough", "onboarding", "welcome", "help", "slash", "demo"],
		description: "Replay the quick intro to the / menu, links, and tags.",
	},
};

export type CommandId = keyof typeof COMMAND_REGISTRY;
export function getCommandDef(id: CommandId): CommandDefinition {
	return COMMAND_REGISTRY[id];
}
export function getCommandIds(): CommandId[] {
	return Object.keys(COMMAND_REGISTRY) as CommandId[];
}
