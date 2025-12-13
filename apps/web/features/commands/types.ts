export type TCommandContext = {
    activeFile?: string;
    selection?: string;
    editorState?: unknown;
    [key: string]: unknown;
};

export type TCommand = {
    id: string;
    label: string;
    description?: string;
    category: string;
    icon?: string;
    defaultKeybinding?: string | string[];
    enabled: boolean;
    when?: (context: TCommandContext) => boolean;
    execute: (context: TCommandContext) => Promise<void> | void;
};

export type TKeybinding = {
    commandId: string;
    keys: string;
    when?: string;
    priority: number;
};
