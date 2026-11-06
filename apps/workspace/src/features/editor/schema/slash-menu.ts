import { type EditorState, Plugin, PluginKey } from "prosemirror-state";

export type SlashTrigger = "/" | ":";

export type SlashMenuState = {
  open: boolean;
  trigger: SlashTrigger;
  query: string;
};

export const slashMenuKey = new PluginKey<SlashMenuState>("skriuw-slash-menu");

const closedSlashMenuState: SlashMenuState = { open: false, trigger: "/", query: "" };

const SLASH_TRIGGER_PATTERN = /(?:^|[\s\0])([/:])([a-z0-9_+-]*)$/i;

export function createSlashMenuPlugin(): Plugin<SlashMenuState> {
  return new Plugin<SlashMenuState>({
    key: slashMenuKey,
    state: {
      init: (): SlashMenuState => closedSlashMenuState,
      apply(transaction, previous) {
        if (!transaction.docChanged && !transaction.selectionSet) return previous;
        const { $from } = transaction.selection;
        if (!$from.parent.isTextblock) return closedSlashMenuState;
        if ($from.parent.type.spec.code) return closedSlashMenuState;
        const before = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
        const match = before.match(SLASH_TRIGGER_PATTERN);
        if (!match) return closedSlashMenuState;
        const trigger: SlashTrigger = match[1] === ":" ? ":" : "/";
        const query = match[2] ?? "";
        if (trigger === ":" && query.length === 0) return closedSlashMenuState;
        return { open: true, trigger, query };
      },
    },
  });
}

export function slashMenuState(state: EditorState): SlashMenuState {
  return slashMenuKey.getState(state) ?? closedSlashMenuState;
}
