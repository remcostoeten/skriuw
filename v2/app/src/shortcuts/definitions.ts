export type ShortcutActionId =
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
  | "findInNote"
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
    group: "Navigation",
    worksWhileTyping: true,
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
  {
    id: "goToNotes",
    keys: "mod+shift+1",
    label: "Go to notes",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "goToTags",
    keys: "mod+shift+2",
    label: "Go to tags",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "goToPeople",
    keys: "mod+shift+3",
    label: "Go to people",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "goToTrash",
    keys: "mod+shift+4",
    label: "Go to trash",
    group: "Navigation",
    worksWhileTyping: true,
  },
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
    id: "findInNote",
    keys: "mod+f",
    label: "Find in note",
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
