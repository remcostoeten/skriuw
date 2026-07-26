import { RAIL_ITEMS, railModShiftKeys, railSequenceKeys } from "./rail-items";

/**
 * Direct tab access, in strip order. Generated so the digit keys and the
 * palette commands stay derived from one list instead of ten hand-written
 * copies.
 */
export const TAB_INDEX_ACTION_IDS = [
  "openTab1",
  "openTab2",
  "openTab3",
  "openTab4",
  "openTab5",
  "openTab6",
  "openTab7",
  "openTab8",
  "openTab9",
] as const;

export type TabIndexActionId = (typeof TAB_INDEX_ACTION_IDS)[number];

export type ShortcutActionId =
  | TabIndexActionId
  | "openLastTab"
  | "toggleCommandPalette"
  | "createNote"
  | "createFolder"
  | "createTag"
  | "createPerson"
  | "togglePinNote"
  | "toggleEditorMode"
  | "renameCurrentNote"
  | "trashCurrentNote"
  | "duplicateCurrentNote"
  | "closeTab"
  | "reopenClosedTab"
  | "moveTabLeft"
  | "moveTabRight"
  | "nextTab"
  | "previousTab"
  | "openBeside"
  | "closeSplit"
  | "openSettings"
  | "toggleSidebar"
  | "toggleMetadata"
  | "focusSidebar"
  | "focusEditor"
  | "focusMetadata"
  | "focusPaneLeft"
  | "focusPaneRight"
  | "previousNote"
  | "nextNote"
  | "goToNotes"
  | "goToTags"
  | "goToPeople"
  | "goToTrash"
  | "toggleMaximize"
  | "quitApp"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "jumpToLine"
  | "goToDocumentStart"
  | "goToDocumentEnd"
  | "findInNote"
  | "findAndReplaceInNote"
  | "searchMatchCase"
  | "searchWholeWord"
  | "searchRegex";

/**
 * Focus contexts that veto a binding:
 * - `typing` — any text field or contenteditable, including the note editor.
 * - `textField` — native text fields only, so editor-scoped keys still fire
 *   while the caret is in the note.
 * - `sidebarTree` — the tree owns its plain keys (F2/r, Delete, m, alt+arrows)
 *   for the focused row and keeps precedence over same-key global bindings.
 * - `modal` — a dialog or the command palette owns the keyboard.
 */
export type ShortcutGuard = "typing" | "textField" | "sidebarTree" | "modal";

/** Runtime platforms, matching `detectPlatform()` from the shortcut package. */
export type ShortcutPlatform = "mac" | "windows" | "linux";

export type ShortcutDefinition = {
  id: ShortcutActionId;
  keys: string | string[];
  label: string;
  group: string;
  /**
   * Longer note for discovery UI, e.g. when the binding deliberately overrides
   * a native key. Falls back to `label`.
   */
  description?: string;
  /** Extra focus contexts where the binding must stay silent. */
  guards?: readonly ShortcutGuard[];
  /**
   * Platforms where the default combo is registered. Omitted means every
   * platform. Lets a default stay off a platform that already owns the combo,
   * while a user override still binds everywhere.
   */
  platforms?: readonly ShortcutPlatform[];
  /**
   * Named scopes the binding requires to fire. Bindings with scopes run only
   * when the workspace has at least one matching scope active, letting a key
   * like `mod+n` mean different things per route.
   */
  scopes?: string | string[];
  /**
   * Modifier combos that should keep working while the caret is in the
   * ProseMirror editor or an input. Plain-key shortcuts must leave this off so
   * they never steal typed characters.
   */
  worksWhileTyping?: boolean;
  secondaryKeys?: string;
  /**
   * Whether `secondaryKeys` also survives typing. Off by default: alternates
   * are usually plain keys that must never steal a typed character.
   */
  secondaryWorksWhileTyping?: boolean;
  boundInEditor?: boolean;
};

const TAB_INDEX_DESCRIPTION =
  "Activate a tab by its position in the focused pane's strip. Alt keeps the digits clear of the mod+digit focus and zoom bindings, and browsers own ctrl+digits for their own tabs — so the combo is reliable on desktop and best-effort on web.";

/**
 * `alt+1`…`alt+9` plus `alt+0` for the last tab, VS Code style. Nothing fires
 * unless the `tabs` scope is active, so with the tabbed workspace off the
 * keypress falls through untouched.
 */
const TAB_INDEX_DEFINITIONS: readonly ShortcutDefinition[] = [
  ...TAB_INDEX_ACTION_IDS.map((id, index) => ({
    id,
    keys: `alt+${index + 1}`,
    label: `Go to tab ${index + 1}`,
    description: TAB_INDEX_DESCRIPTION,
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"] as const,
    scopes: "tabs",
  })),
  {
    id: "openLastTab",
    keys: "alt+0",
    label: "Go to last tab",
    description: TAB_INDEX_DESCRIPTION,
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"] as const,
    scopes: "tabs",
  },
];

/**
 * `mod+shift+<n>` plus the `g then t then <n>` alternate, one per rail item,
 * numbered in the rail's visual order. The sequence stays off by default
 * while typing (`secondaryWorksWhileTyping` unset), and both forms stay
 * silent behind a modal so command palette and settings keep ownership of
 * the keyboard.
 */
const RAIL_NAVIGATION_DEFINITIONS: readonly ShortcutDefinition[] = RAIL_ITEMS.map(
  (item, index) => {
    const position = index + 1;
    const destination = item.label.toLowerCase();
    return {
      id: item.actionId,
      keys: railModShiftKeys(position),
      secondaryKeys: railSequenceKeys(position),
      label: `Go to ${destination}`,
      description: `Go to ${destination}. Also fires as g then t then ${position}, following the rail's top-to-bottom order; the sequence stays silent while typing so it never steals "gt${position}" from a note.`,
      group: "Navigation",
      worksWhileTyping: true,
      guards: ["modal"],
    };
  },
);

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  {
    id: "toggleCommandPalette",
    keys: "mod+k",
    label: "Open command palette",
    group: "General",
    worksWhileTyping: true,
  },
  {
    id: "createNote",
    keys: "mod+n",
    label: "New note",
    group: "Workspace",
    worksWhileTyping: true,
    scopes: "note-create",
  },
  {
    id: "createFolder",
    keys: "mod+shift+n",
    label: "New folder",
    group: "Workspace",
    worksWhileTyping: true,
  },
  {
    id: "createTag",
    keys: "mod+shift+t",
    label: "New tag",
    group: "Workspace",
    worksWhileTyping: true,
    scopes: "tags-route",
  },
  {
    id: "createPerson",
    keys: "mod+shift+p",
    label: "New person",
    group: "Workspace",
    worksWhileTyping: true,
  },
  {
    id: "togglePinNote",
    keys: "mod+p",
    label: "Pin or unpin current note",
    group: "Workspace",
    worksWhileTyping: true,
  },
  {
    id: "renameCurrentNote",
    keys: "f2",
    label: "Rename current note",
    group: "Workspace",
    worksWhileTyping: true,
    guards: ["textField", "sidebarTree", "modal"],
  },
  {
    id: "trashCurrentNote",
    keys: "mod+backspace",
    secondaryKeys: "mod+delete",
    secondaryWorksWhileTyping: true,
    label: "Move current note to trash",
    description:
      "Move current note to trash. Overrides the macOS text-field delete-to-line-start default while the caret is in a note.",
    group: "Workspace",
    worksWhileTyping: true,
    guards: ["textField", "sidebarTree", "modal"],
  },
  {
    id: "duplicateCurrentNote",
    keys: "mod+shift+d",
    label: "Duplicate current note",
    description:
      "Duplicate current note and rename the copy. Overrides the browser's bookmark-all-tabs default on web.",
    group: "Workspace",
    worksWhileTyping: true,
    guards: ["textField", "modal"],
  },
  {
    id: "toggleEditorMode",
    keys: "mod+m",
    label: "Toggle raw Markdown mode",
    group: "Workspace",
    worksWhileTyping: true,
  },
  {
    id: "closeTab",
    keys: "mod+w",
    label: "Close tab",
    group: "Tabs",
    worksWhileTyping: true,
  },
  {
    id: "reopenClosedTab",
    keys: "mod+shift+w",
    label: "Reopen closed tab",
    description:
      "Reopen the last tab closed in this pane at its old position, walking back through the ten most recent. Browser muscle memory says ctrl+shift+t, but that belongs to New tag — this is the undo of Close tab instead.",
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "tabs",
  },
  {
    id: "moveTabLeft",
    keys: "ctrl+shift+pageup",
    label: "Move tab left",
    description:
      "Move the active tab one slot left, wrapping at the ends. Browsers own this combo for their own tab strip, so it is reliable on desktop and best-effort on web.",
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "tabs",
  },
  {
    id: "moveTabRight",
    keys: "ctrl+shift+pagedown",
    label: "Move tab right",
    description:
      "Move the active tab one slot right, wrapping at the ends. Browsers own this combo for their own tab strip, so it is reliable on desktop and best-effort on web.",
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "tabs",
  },
  {
    id: "nextTab",
    keys: "ctrl+tab",
    label: "Next tab",
    group: "Tabs",
    worksWhileTyping: true,
  },
  {
    id: "previousTab",
    keys: "ctrl+shift+tab",
    label: "Previous tab",
    group: "Tabs",
    worksWhileTyping: true,
  },
  ...TAB_INDEX_DEFINITIONS,
  {
    id: "openBeside",
    keys: "mod+backslash",
    label: "Open current note beside",
    group: "Tabs",
    worksWhileTyping: true,
  },
  {
    id: "closeSplit",
    keys: "mod+shift+backslash",
    label: "Close split view",
    group: "Tabs",
    worksWhileTyping: true,
  },
  {
    id: "openSettings",
    keys: "mod+,",
    label: "Open settings",
    group: "General",
    worksWhileTyping: true,
  },
  {
    id: "toggleSidebar",
    keys: "mod+b",
    label: "Toggle sidebar",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "toggleMetadata",
    keys: "ctrl+shift+b",
    label: "Toggle metadata panel",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "focusSidebar",
    keys: "mod+e",
    label: "Focus current note in sidebar",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "focusEditor",
    keys: "mod+2",
    secondaryKeys: "slash",
    label: "Focus editor",
    description:
      "Focus the editor content. With a split open this returns to the pane that had focus last, so it composes with the directional pane keys.",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "focusPaneLeft",
    keys: "mod+alt+arrowleft",
    label: "Focus pane to the left",
    description:
      "Move keyboard focus to the split pane on the left. Three modifiers keep it clear of every native word and line motion; some Linux desktops and macOS apps claim mod+alt+arrows, so rebind if the OS wins.",
    group: "Navigation",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "split",
  },
  {
    id: "focusPaneRight",
    keys: "mod+alt+arrowright",
    label: "Focus pane to the right",
    description:
      "Move keyboard focus to the split pane on the right. Three modifiers keep it clear of every native word and line motion; some Linux desktops and macOS apps claim mod+alt+arrows, so rebind if the OS wins.",
    group: "Navigation",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "split",
  },
  {
    id: "focusMetadata",
    keys: "mod+3",
    label: "Focus metadata panel",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "previousNote",
    keys: "ctrl+shift+bracketleft",
    label: "Previous note",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "nextNote",
    keys: "ctrl+shift+bracketright",
    label: "Next note",
    group: "Navigation",
    worksWhileTyping: true,
  },
  ...RAIL_NAVIGATION_DEFINITIONS,
  {
    id: "toggleMaximize",
    keys: "mod+enter",
    label: "Toggle maximize",
    group: "View",
    worksWhileTyping: true,
  },
  {
    id: "quitApp",
    keys: "mod+shift+q",
    label: "Quit",
    group: "General",
    worksWhileTyping: true,
  },
  {
    id: "zoomIn",
    keys: "mod+equal",
    label: "Zoom in",
    group: "View",
    worksWhileTyping: true,
  },
  {
    id: "zoomOut",
    keys: "mod+minus",
    label: "Zoom out",
    group: "View",
    worksWhileTyping: true,
  },
  {
    id: "zoomReset",
    keys: "mod+0",
    label: "Reset zoom",
    group: "View",
    worksWhileTyping: true,
  },
  {
    id: "jumpToLine",
    keys: "mod+g",
    label: "Jump to line",
    description:
      "Toggle the jump-to-line field. Raw Markdown mode only — block mode has no line numbers to jump to. Overrides Firefox's find-again default on web.",
    group: "Editor",
    worksWhileTyping: true,
    scopes: "markdown",
    boundInEditor: true,
  },
  {
    id: "goToDocumentStart",
    keys: "ctrl+arrowup",
    label: "Jump to start of note",
    description:
      "Move the caret and scroll to the very start of the note. VS Code scrolls the viewport with this combo instead; on macOS cmd+arrowup does this natively, so the default stays unregistered there.",
    group: "Editor",
    worksWhileTyping: true,
    platforms: ["windows", "linux"],
    boundInEditor: true,
  },
  {
    id: "goToDocumentEnd",
    keys: "ctrl+arrowdown",
    label: "Jump to end of note",
    description:
      "Move the caret and scroll to the very end of the note. VS Code scrolls the viewport with this combo instead; on macOS cmd+arrowdown does this natively, so the default stays unregistered there.",
    group: "Editor",
    worksWhileTyping: true,
    platforms: ["windows", "linux"],
    boundInEditor: true,
  },
  {
    id: "findInNote",
    keys: "mod+f",
    label: "Find in note",
    group: "Editor search",
    worksWhileTyping: true,
    scopes: "note-focus",
  },
  {
    id: "findAndReplaceInNote",
    keys: "mod+h",
    secondaryKeys: "mod+alt+f",
    secondaryWorksWhileTyping: true,
    label: "Find and replace in note",
    description:
      "Open the find panel with the replace row expanded. Overrides the browser's history shortcut on web; mod+alt+f is VS Code's macOS default, where cmd+h hides the app.",
    group: "Editor search",
    worksWhileTyping: true,
    scopes: "note-focus",
  },
  {
    id: "searchMatchCase",
    keys: "alt+c",
    label: "Toggle match case",
    group: "Editor search",
    worksWhileTyping: true,
    boundInEditor: true,
  },
  {
    id: "searchWholeWord",
    keys: "alt+w",
    label: "Toggle whole word",
    group: "Editor search",
    worksWhileTyping: true,
    boundInEditor: true,
  },
  {
    id: "searchRegex",
    keys: "alt+r",
    label: "Toggle regular expression",
    group: "Editor search",
    worksWhileTyping: true,
    boundInEditor: true,
  },
];
