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
  | "goToTrash";

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
    keys: "mod+alt+b",
    label: "Toggle metadata panel",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "focusSidebar",
    keys: "mod+1",
    label: "Focus sidebar",
    group: "Navigation",
    worksWhileTyping: true,
  },
  {
    id: "focusEditor",
    keys: "mod+2",
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
];
