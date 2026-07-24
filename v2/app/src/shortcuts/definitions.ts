export type ShortcutActionId =
  | "toggleCommandPalette"
  | "createNote"
  | "createFolder"
  | "openSettings"
  | "toggleSidebar"
  | "toggleMetadata"
  | "focusSidebar"
  | "focusEditor"
  | "focusMetadata"
  | "goToNotes"
  | "goToTrash"
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
  },
  {
    id: "createFolder",
    keys: "mod+shift+n",
    label: "New folder",
    group: "Workspace",
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
    id: "goToTrash",
    keys: "mod+shift+2",
    label: "Go to trash",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "findInNote",
    keys: "mod+f",
    label: "Find in note",
    group: "Editor search",
    worksWhileTyping: true,
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
