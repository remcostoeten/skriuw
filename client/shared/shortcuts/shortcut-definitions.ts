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
} satisfies Record<string, ShortcutDefinition>;

export type ShortcutId = keyof typeof shortcutDefinitions;

