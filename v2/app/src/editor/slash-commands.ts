import { setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { productSchema } from "./schema";

export type SlashCommand = {
  id: string;
  label: string;
  command: Command;
};

function requiredNode(name: string) {
  const node = productSchema.nodes[name];
  if (!node) {
    throw new Error(`product schema is missing node ${name}`);
  }
  return node;
}

export const slashCommands: SlashCommand[] = [
  { id: "text", label: "Text", command: setBlockType(requiredNode("paragraph")) },
  {
    id: "heading-1",
    label: "Heading 1",
    command: setBlockType(requiredNode("heading"), { level: 1 }),
  },
  {
    id: "heading-2",
    label: "Heading 2",
    command: setBlockType(requiredNode("heading"), { level: 2 }),
  },
  {
    id: "heading-3",
    label: "Heading 3",
    command: setBlockType(requiredNode("heading"), { level: 3 }),
  },
  { id: "bullet-list", label: "Bullet list", command: wrapInList(requiredNode("bullet_list")) },
  {
    id: "ordered-list",
    label: "Numbered list",
    command: wrapInList(requiredNode("ordered_list")),
  },
  { id: "quote", label: "Quote", command: wrapIn(requiredNode("blockquote")) },
  { id: "code", label: "Code block", command: setBlockType(requiredNode("code_block")) },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  const needle = query.toLowerCase();
  return slashCommands.filter(
    (command) =>
      command.id.includes(needle) || command.label.toLowerCase().includes(needle),
  );
}

export function applySlashCommand(view: EditorView, command: SlashCommand): void {
  const { $from } = view.state.selection;
  const start = $from.start();
  view.dispatch(view.state.tr.delete(start, $from.pos));
  command.command(view.state, view.dispatch);
  view.focus();
}
