export type ShortcutActionId =
  | "toggleCommandPalette"
  | "createNote"
  | "createFolder"
  | "createTag"
  | "createPerson"
  | "togglePinNote"
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
  | "goToNotes"
  | "goToTags"
  | "goToPeople"
  | "goToTrash"
  | "toggleFullscreen"
  | "quitApp"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "findInNote"
  | "searchMatchCase"
  | "searchWholeWord"
  | "searchRegex";

export type ShortcutDefinition = {
  id: ShortcutActionId;
  keys: string | string[];
  label: string;
  group: string;
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
    id: "toggleFullscreen",
    keys: "mod+enter",
    label: "Toggle fullscreen",
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
