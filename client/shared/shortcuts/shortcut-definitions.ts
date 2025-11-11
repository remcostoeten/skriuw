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
    "new-note": {
        keys: [["Ctrl", "n"], ["Meta", "n"]],
        description: "Create a new note",
    },
    "save-note": {
        keys: [["Ctrl", "s"], ["Meta", "s"]],
        description: "Save the current note",
    },
    "delete-note": {
        keys: [["Ctrl", "Shift", "Delete"], ["Meta", "Shift", "Backspace"]],
        description: "Delete the current note",
    },
    "search-notes": {
        keys: [["Ctrl", "k"], ["Meta", "k"]],
        description: "Search all notes",
    },
    "toggle-sidebar": {
        keys: [["Ctrl", "b"], ["Meta", "b"]],
        description: "Toggle the sidebar",
    },
    "toggle-shortcuts": {
        keys: [["Ctrl", "/"], ["Meta", "/"]],
        description: "Open shortcuts panel",
    },
    "previous-note": {
        keys: [["Ctrl", "ArrowUp"], ["Meta", "ArrowUp"]],
        description: "Navigate to previous note",
    },
    "next-note": {
        keys: [["Ctrl", "ArrowDown"], ["Meta", "ArrowDown"]],
        description: "Navigate to next note",
    },
    "settings": {
        keys: [["Ctrl", ","], ["Meta", ","]],
        description: "Open settings",
    },
} satisfies Record<string, ShortcutDefinition>;

export type ShortcutId = keyof typeof shortcutDefinitions;

