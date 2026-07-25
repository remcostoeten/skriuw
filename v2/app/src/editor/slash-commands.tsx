import type { ReactNode } from "react";
import { setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { TextSelection, type Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  SquareCodeIcon,
  TableIcon,
  TextQuoteIcon,
  TypeIcon,
} from "../shared/icons";
import { productSchema } from "./schema";

export type SlashAction = "insert-image";

export type SlashCommand = {
  id: string;
  label: string;
  subtext: string;
  group: string;
  aliases: readonly string[];
  icon: ReactNode;
  command: Command;
  action?: SlashAction;
};

function requiredNode(name: string) {
  const node = productSchema.nodes[name];
  if (!node) {
    throw new Error(`product schema is missing node ${name}`);
  }
  return node;
}

export const slashCommands: SlashCommand[] = [
  {
    id: "text",
    label: "Text",
    subtext: "Plain paragraph text",
    group: "Basic",
    aliases: ["paragraph", "plain", "p"],
    icon: <TypeIcon size={16} />,
    command: setBlockType(requiredNode("paragraph")),
  },
  {
    id: "heading-1",
    label: "Heading 1",
    subtext: "Large section heading",
    group: "Basic",
    aliases: ["h1", "title", "#"],
    icon: <Heading1Icon size={16} />,
    command: setBlockType(requiredNode("heading"), { level: 1 }),
  },
  {
    id: "heading-2",
    label: "Heading 2",
    subtext: "Medium section heading",
    group: "Basic",
    aliases: ["h2", "subtitle", "##"],
    icon: <Heading2Icon size={16} />,
    command: setBlockType(requiredNode("heading"), { level: 2 }),
  },
  {
    id: "heading-3",
    label: "Heading 3",
    subtext: "Small section heading",
    group: "Basic",
    aliases: ["h3", "###"],
    icon: <Heading3Icon size={16} />,
    command: setBlockType(requiredNode("heading"), { level: 3 }),
  },
  {
    id: "bullet-list",
    label: "Bullet list",
    subtext: "Unordered list with bullets",
    group: "Lists",
    aliases: ["ul", "unordered", "bullets"],
    icon: <ListIcon size={16} />,
    command: wrapInList(requiredNode("bullet_list")),
  },
  {
    id: "ordered-list",
    label: "Numbered list",
    subtext: "Ordered list with numbers",
    group: "Lists",
    aliases: ["ol", "ordered", "numbers"],
    icon: <ListOrderedIcon size={16} />,
    command: wrapInList(requiredNode("ordered_list")),
  },
  {
    id: "check-list",
    label: "Check list",
    subtext: "To-do list with checkboxes",
    group: "Lists",
    aliases: ["todo", "task", "checkbox", "checklist"],
    icon: <ListTodoIcon size={16} />,
    command: wrapInList(requiredNode("check_list")),
  },
  {
    id: "quote",
    label: "Quote",
    subtext: "Block quotation",
    group: "Blocks",
    aliases: ["blockquote", "citation"],
    icon: <TextQuoteIcon size={16} />,
    command: wrapIn(requiredNode("blockquote")),
  },
  {
    id: "code",
    label: "Code block",
    subtext: "Preformatted monospaced block",
    group: "Blocks",
    aliases: ["codeblock", "fence", "pre", "snippet"],
    icon: <SquareCodeIcon size={16} />,
    command: setBlockType(requiredNode("code_block")),
  },
  {
    id: "image",
    label: "Image",
    subtext: "Upload an image from this device",
    group: "Blocks",
    aliases: ["img", "picture", "photo", "upload"],
    icon: <ImageIcon size={16} />,
    command: () => true,
    action: "insert-image",
  },
  {
    id: "table",
    label: "Table",
    subtext: "Three column table with a header row",
    group: "Blocks",
    aliases: ["grid", "spreadsheet", "rows", "columns"],
    icon: <TableIcon size={16} />,
    command: insertTable,
  },
  {
    id: "divider",
    label: "Divider",
    subtext: "Horizontal separator line",
    group: "Blocks",
    aliases: ["hr", "rule", "separator", "line"],
    icon: <MinusIcon size={16} />,
    command: insertHorizontalRule,
  },
];

function insertHorizontalRule(
  state: Parameters<Command>[0],
  dispatch?: Parameters<Command>[1],
): boolean {
  const horizontalRule = requiredNode("horizontal_rule");
  const paragraph = requiredNode("paragraph");
  if (dispatch) {
    const transaction = state.tr.replaceSelectionWith(horizontalRule.create());
    const afterRule = transaction.selection.to;
    if (!transaction.doc.resolve(afterRule).nodeAfter) {
      transaction.insert(afterRule, paragraph.create());
    }
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(afterRule), 1),
    );
    dispatch(transaction.scrollIntoView());
  }
  return true;
}

const TABLE_COLUMNS = 3;
const TABLE_BODY_ROWS = 2;

function tableRow(cellType: ReturnType<typeof requiredNode>) {
  const cells = Array.from({ length: TABLE_COLUMNS }, () => cellType.createAndFill());
  if (cells.some((cell) => cell === null)) return null;
  return requiredNode("table_row").createAndFill(null, cells as NonNullable<
    (typeof cells)[number]
  >[]);
}

function insertTable(
  state: Parameters<Command>[0],
  dispatch?: Parameters<Command>[1],
): boolean {
  const header = tableRow(requiredNode("table_header"));
  if (!header) return false;
  const rows = [header];
  for (let index = 0; index < TABLE_BODY_ROWS; index += 1) {
    const row = tableRow(requiredNode("table_cell"));
    if (!row) return false;
    rows.push(row);
  }
  const table = requiredNode("table").createAndFill(null, rows);
  if (!table) return false;
  if (dispatch) {
    const paragraph = requiredNode("paragraph");
    const transaction = state.tr.replaceSelectionWith(table);
    const tableStart = findNodePosition(transaction.doc, table);
    if (tableStart !== null) {
      const afterTable = tableStart + table.nodeSize;
      if (!transaction.doc.resolve(afterTable).nodeAfter) {
        transaction.insert(afterTable, paragraph.create());
      }
      transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(tableStart), 1),
      );
    }
    dispatch(transaction.scrollIntoView());
  }
  return true;
}

/**
 * `replaceSelectionWith` leaves the selection after the inserted table whenever
 * a text position exists there, so the table's own position has to be recovered
 * by identity: the transaction inserts the very node instance handed to it.
 */
function findNodePosition(doc: ProseMirrorNode, target: ProseMirrorNode): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node === target) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function matchScore(command: SlashCommand, needle: string): number | null {
  if (needle.length === 0) return 0;
  const label = command.label.toLowerCase();
  if (label.startsWith(needle)) return 0;
  if (command.aliases.some((alias) => alias.startsWith(needle))) return 1;
  if (label.includes(needle) || command.id.includes(needle)) return 2;
  if (command.aliases.some((alias) => alias.includes(needle))) return 3;
  return null;
}

/**
 * Filters commands the way the v1 suggestion menu does: label and aliases both
 * match, prefix matches rank above substring matches, and the original
 * (grouped) order is kept as the tiebreak.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  return slashCommands
    .map((command, order) => ({ command, order, score: matchScore(command, needle) }))
    .filter((entry): entry is typeof entry & { score: number } => entry.score !== null)
    .sort((left, right) => left.score - right.score || left.order - right.order)
    .map((entry) => entry.command);
}

/**
 * Removes the typed trigger and runs the command, returning the command's
 * `action` when it needs host state the `Command` signature cannot reach (the
 * workspace store and active note id). The caller performs that follow-up.
 */
export function applySlashCommand(
  view: EditorView,
  command: SlashCommand,
): SlashAction | null {
  const { $from } = view.state.selection;
  const start = $from.start();
  const before = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
  const slashIndex = before.lastIndexOf("/");
  const from = slashIndex >= 0 ? start + slashIndex : start;
  view.dispatch(view.state.tr.delete(from, $from.pos));
  if (!command.action) {
    command.command(view.state, view.dispatch);
  }
  view.focus();
  return command.action ?? null;
}
