export type KeyCombo = string[];

export type ShortcutDefinition = {
    keys: KeyCombo[];
    description?: string;
};

export const shortcutDefinitions = {
    "editor-focus": {
        keys: [["/"]],
        description: "Focus the active note editor",
    },
    "toggle-shortcuts": {
        keys: [["Ctrl", "/"], ["Meta", "/"]],
        description: "Open shortcuts panel",
    },
    "create-note": {
        keys: [["Ctrl", "n"], ["Meta", "n"]],
        description: "Create a new note",
    },
    "open-collection": {
        keys: [["Ctrl", "o"], ["Meta", "o"]],
        description: "Open a collection",
    },
    "toggle-sidebar": {
        keys: [["Ctrl", "b"], ["Meta", "b"]],
        description: "Toggle sidebar visibility",
    },
    "save-note": {
        keys: [["Ctrl", "s"], ["Meta", "s"]],
        description: "Save the current note",
    },
    "search-notes": {
        keys: [["Ctrl", "k"], ["Meta", "k"]],
        description: "Search notes",
    },
    "delete-item": {
        keys: [["Delete"], ["Ctrl", "Backspace"], ["Meta", "Backspace"]],
        description: "Delete selected file/folder when context menu is open",
    },
} satisfies Record<string, ShortcutDefinition>;

export type ShortcutId = keyof typeof shortcutDefinitions;

