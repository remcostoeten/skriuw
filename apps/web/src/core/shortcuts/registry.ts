import type { ExceptPreset } from "@remcostoeten/use-shortcut";
import { SCOPES, type Scope } from "./scopes";

export type ShortcutDefinition = {
	/** Default binding. An array registers multiple combos for the same action. */
	keys: string | string[];
	/** Named scope that must be active for this shortcut to fire. */
	scope: Scope;
	/** Heading used to group the shortcut in the help dialog and settings UI. */
	group: string;
	/** Short, human label shown to the user. */
	label: string;
	/** Longer explanation shown beneath the label where space allows. */
	description?: string;
	/**
	 * Context in which the shortcut should be suppressed. Defaults to `"typing"`
	 * so shortcuts never steal keystrokes from inputs/editors. Pass `false` to
	 * opt out (e.g. a shortcut meant to fire from within a field).
	 */
	except?: ExceptPreset | false;
	/** Whether to call `preventDefault()` when the shortcut fires. */
	preventDefault?: boolean;
};

/**
 * The single source of truth for every keyboard shortcut in the app. Bindings,
 * the help dialog, and the settings remap UI are all derived from this map, so
 * adding or changing a shortcut means editing exactly one entry here.
 *
 * `user-menu` shortcuts are bare keys that are only active while the user-menu
 * popover is open (its component toggles the scope), which is what keeps the
 * single-letter bindings from hijacking normal typing.
 */
export const SHORTCUT_REGISTRY = {
	"menu.profile": {
		keys: "p",
		scope: SCOPES.userMenu,
		group: "User menu",
		label: "Open profile",
	},
	"menu.notes": {
		keys: "n",
		scope: SCOPES.userMenu,
		group: "User menu",
		label: "Go to notes",
	},
	"menu.journal": {
		keys: "j",
		scope: SCOPES.userMenu,
		group: "User menu",
		label: "Go to journal",
	},
	"menu.activity": {
		keys: "a",
		scope: SCOPES.userMenu,
		group: "User menu",
		label: "Go to activity",
	},
	"menu.settings": {
		keys: "mod+comma",
		scope: SCOPES.userMenu,
		group: "User menu",
		label: "Open settings",
		preventDefault: true,
	},
	"menu.signOut": {
		keys: "mod+delete",
		scope: SCOPES.userMenu,
		group: "User menu",
		label: "Sign out",
	},

	"notes.commandPalette": {
		keys: ["mod+k", "mod+shift+p"],
		scope: SCOPES.notes,
		group: "Notes",
		label: "Open command palette",
		except: false,
		preventDefault: true,
	},
	"notes.newNote": {
		keys: "mod+n",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Create note",
		except: false,
		preventDefault: true,
	},
	"notes.newFolder": {
		keys: "mod+shift+n",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Create folder",
		preventDefault: true,
	},
	"notes.toggleSidebar": {
		keys: "mod+shift+b",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Toggle sidebar",
		except: false,
		preventDefault: true,
	},
	"notes.toggleMetadata": {
		keys: "mod+shift+alt+b",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Toggle note details",
		except: false,
		preventDefault: true,
	},
	"notes.settings": {
		keys: "mod+comma",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Open settings",
		preventDefault: true,
	},
	"notes.toggleEditor": {
		keys: "mod+alt+e",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Switch editor mode",
	},
	"notes.focusFileTree": {
		keys: "ctrl+e",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Focus file tree",
		description: "Move focus to the active note in the file tree.",
		except: false,
		preventDefault: true,
	},
	"notes.toggleSplit": {
		keys: "mod+shift+e",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Toggle split editor",
		except: false,
		preventDefault: true,
	},
	"notes.splitHorizontal": {
		keys: "ctrl+h",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Split editor horizontally",
		except: false,
		preventDefault: true,
	},
	"notes.closeTab": {
		keys: "ctrl+w",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Close tab",
		description: "Close the focused tab (closes the split or empties the pane when it is the last tab).",
		except: false,
		preventDefault: true,
	},
	"notes.closeSplit": {
		keys: "ctrl+shift+w",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Close split pane",
		except: false,
		preventDefault: true,
	},
	"notes.focusNextSplitPane": {
		keys: "ctrl+`",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Focus next split pane",
		except: false,
		preventDefault: true,
	},
	"notes.focusPreviousSplitPane": {
		keys: "ctrl+shift+`",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Focus previous split pane",
		except: false,
		preventDefault: true,
	},
	"notes.focusEditor": {
		keys: "slash",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Focus editor",
		description: "Jump the caret into the note body.",
		preventDefault: true,
	},
	"notes.focusSidebarSearch": {
		keys: "ctrl+slash",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Focus sidebar search",
		description: "Open the sidebar search field.",
		preventDefault: true,
	},
	"notes.help": {
		keys: "shift+slash",
		scope: SCOPES.notes,
		group: "Notes",
		label: "Open shortcut help",
	},

	"journal.commandPalette": {
		keys: ["mod+k", "mod+shift+p"],
		scope: SCOPES.journal,
		group: "Journal",
		label: "Open command palette",
		except: false,
		preventDefault: true,
	},
	"journal.toggleSidebar": {
		keys: "mod+slash",
		scope: SCOPES.journal,
		group: "Journal",
		label: "Toggle sidebar",
	},
	"journal.settings": {
		keys: "mod+comma",
		scope: SCOPES.journal,
		group: "Journal",
		label: "Open settings",
		preventDefault: true,
	},
	"journal.toggleEditor": {
		keys: "mod+e",
		scope: SCOPES.journal,
		group: "Journal",
		label: "Switch editor mode",
	},
	"journal.focusEditor": {
		keys: "slash",
		scope: SCOPES.journal,
		group: "Journal",
		label: "Focus editor",
		description: "Jump the caret into the journal entry.",
		preventDefault: true,
	},
	"journal.help": {
		keys: "shift+slash",
		scope: SCOPES.journal,
		group: "Journal",
		label: "Open shortcut help",
	},
} as const satisfies Record<string, ShortcutDefinition>;

export type ShortcutId = keyof typeof SHORTCUT_REGISTRY;

export function getShortcutIds(): ShortcutId[] {
	return Object.keys(SHORTCUT_REGISTRY) as ShortcutId[];
}

/**
 * Reads a definition widened to {@link ShortcutDefinition}. The registry uses
 * `as const` so its ids stay literal, which narrows each entry to its exact
 * shape and hides absent optional fields — this accessor restores the full
 * surface for callers that read `description`/`except`/`preventDefault`.
 */
export function getShortcutDef(id: ShortcutId): ShortcutDefinition {
	return SHORTCUT_REGISTRY[id];
}
