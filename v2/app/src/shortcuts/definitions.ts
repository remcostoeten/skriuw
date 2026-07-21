export type ShortcutActionId =
  | "toggleCommandPalette"
  | "createNote"
  | "createFolder"
  | "openSettings";

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
];
