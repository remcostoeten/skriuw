import type { ReactNode } from "react";
import { setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { NodeSelection, TextSelection, type Command } from "prosemirror-state";
import { findWrapping } from "prosemirror-transform";
import type { EditorView } from "prosemirror-view";
import {
  ChevronRightIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  MusicIcon,
  PaperclipIcon,
  SmileIcon,
  SquareCodeIcon,
  TableIcon,
  TextQuoteIcon,
  TypeIcon,
  VideoIcon,
  WaypointsIcon,
} from "@/shared/icons/static";
import { createDefaultDiagram, diagramTemplates, type DiagramModel } from "./diagram-model";
import { emojiEntries } from "./emoji";
import { productSchema, type MediaKind, type SlashTrigger } from "./schema";
import { insertTask } from "./task-promotion";

export type SlashAction = "pick-image" | "pick-video" | "open-emoji";

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

const EMOJI_RESULT_LIMIT = 60;

function requiredNode(name: string) {
  const node = productSchema.nodes[name];
  if (!node) {
    throw new Error(`product schema is missing node ${name}`);
  }
  return node;
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

const headingIcons = [
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
];

const headingSubtexts = [
  "Large section heading",
  "Medium section heading",
  "Small section heading",
  "Minor subsection heading",
  "Small subsection heading",
  "Lowest level heading",
];

function headingCommands(): SlashCommand[] {
  return HEADING_LEVELS.map((level) => {
    const Icon = headingIcons[level - 1]!;
    return {
      id: `heading-${level}`,
      label: `Heading ${level}`,
      subtext: headingSubtexts[level - 1]!,
      group: "Basic",
      aliases: [`h${level}`, "#".repeat(level), ...(level === 1 ? ["title"] : []),
        ...(level === 2 ? ["subtitle"] : [])],
      icon: <Icon size={16} />,
      command: setBlockType(requiredNode("heading"), { level }),
    };
  });
}

function toggleHeadingCommands(): SlashCommand[] {
  return ([1, 2, 3] as const).map((level) => {
    const Icon = headingIcons[level - 1]!;
    return {
      id: `toggle-heading-${level}`,
      label: `Toggle heading ${level}`,
      subtext: "Collapsible section with a heading summary",
      group: "Lists",
      aliases: [`th${level}`, "collapse", "expand", "disclosure", "fold"],
      icon: <Icon size={16} />,
      command: wrapInToggleHeading(level),
    };
  });
}

function mediaCommands(): SlashCommand[] {
  return [
    {
      id: "video",
      label: "Video",
      subtext: "Choose a workspace video, upload, or embed a URL",
      group: "Media",
      aliases: ["movie", "mp4", "youtube", "embed", "clip"],
      icon: <VideoIcon size={16} />,
      command: () => true,
      action: "pick-video",
    },
    {
      id: "audio",
      label: "Audio",
      subtext: "Embed audio from a URL",
      group: "Media",
      aliases: ["sound", "mp3", "music", "podcast", "embed"],
      icon: <MusicIcon size={16} />,
      command: insertMedia("audio"),
    },
    {
      id: "file",
      label: "File",
      subtext: "Link an attachment by URL",
      group: "Media",
      aliases: ["attachment", "document", "download", "pdf"],
      icon: <PaperclipIcon size={16} />,
      command: insertMedia("file"),
    },
  ];
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
  ...headingCommands(),
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
    subtext: "Document-local checkboxes",
    group: "Lists",
    aliases: ["checkbox", "checklist"],
    icon: <ListTodoIcon size={16} />,
    command: wrapInList(requiredNode("check_list")),
  },
  {
    id: "task",
    label: "Task",
    subtext: "Actionable item tracked across the workspace",
    group: "Lists",
    aliases: ["todo", "task"],
    icon: <ListTodoIcon size={16} />,
    command: insertTask,
  },
  {
    id: "toggle-list",
    label: "Toggle list",
    subtext: "Collapsible list with a disclosure",
    group: "Lists",
    aliases: ["collapse", "expand", "disclosure"],
    icon: <ChevronRightIcon size={16} />,
    command: wrapInList(requiredNode("toggle_list")),
  },
  ...toggleHeadingCommands(),
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
    id: "diagram",
    label: "Diagram",
    subtext: "Create a keyboard-friendly flowchart",
    group: "Blocks",
    aliases: ["mermaid", "flowchart", "graph", "nodes", "workflow"],
    icon: <WaypointsIcon size={16} />,
    command: insertDiagram(createDefaultDiagram),
  },
  ...diagramTemplates.map((template) => ({
    id: template.id,
    label: template.label,
    subtext: template.subtext,
    group: "Blocks",
    aliases: ["diagram", ...template.aliases],
    icon: <WaypointsIcon size={16} />,
    command: insertDiagram(template.create),
  })),
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
  {
    id: "emoji",
    label: "Emoji",
    subtext: "Search for and insert an emoji",
    group: "Blocks",
    aliases: ["emote", "emotion", "smiley", "face", "symbol"],
    icon: <SmileIcon size={16} />,
    command: () => true,
    action: "open-emoji",
  },
  {
    id: "image",
    label: "Image",
    subtext: "Choose a workspace image or upload one",
    group: "Media",
    aliases: ["img", "picture", "photo", "upload"],
    icon: <ImageIcon size={16} />,
    command: () => true,
    action: "pick-image",
  },
  ...mediaCommands(),
];

export const emojiCommands: SlashCommand[] = emojiEntries.map((entry) => ({
  id: `emoji-${entry.shortcode}`,
  label: entry.name,
  subtext: `:${entry.shortcode}:`,
  group: entry.group,
  aliases: [entry.shortcode, ...entry.keywords],
  icon: entry.char,
  command: insertText(entry.char),
}));

function insertText(text: string): Command {
  return (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.insertText(text).scrollIntoView());
    }
    return true;
  };
}

/**
 * A toggle summary is a heading node rather than a styled paragraph so it keeps
 * feeding the note outline and heading navigation.
 */
function wrapInToggleHeading(level: number): Command {
  return (state, dispatch) => {
    const toggleItem = requiredNode("toggle_item");
    const heading = requiredNode("heading");
    const { $from } = state.selection;
    if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type !== toggleItem) continue;
      return setBlockType(heading, { level })(state, dispatch);
    }
    const range = $from.blockRange();
    if (!range) return false;
    const wrapping = findWrapping(range, requiredNode("toggle_list"));
    if (!wrapping) return false;
    if (dispatch) {
      const transaction = state.tr.wrap(range, wrapping);
      const $summary = transaction.doc.resolve(
        transaction.mapping.map(state.selection.from),
      );
      transaction.setNodeMarkup($summary.before($summary.depth), heading, { level });
      dispatch(transaction.scrollIntoView());
    }
    return true;
  };
}

export function insertMedia(kind: MediaKind): Command {
  return (state, dispatch) => {
    const media = requiredNode("media");
    const paragraph = requiredNode("paragraph");
    if (dispatch) {
      const node = media.create({ kind, src: "", title: "" });
      const transaction = state.tr.replaceSelectionWith(node);
      const insertedAt = findNodePosition(transaction.doc, node);
      if (insertedAt !== null) {
        const afterMedia = insertedAt + node.nodeSize;
        if (!transaction.doc.resolve(afterMedia).nodeAfter) {
          transaction.insert(afterMedia, paragraph.create());
        }
        transaction.setSelection(
          NodeSelection.create(transaction.doc, insertedAt),
        );
      }
      dispatch(transaction.scrollIntoView());
    }
    return true;
  };
}

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

function insertDiagram(createModel: () => DiagramModel): Command {
  return function insertDiagramCommand(state, dispatch) {
    const diagram = requiredNode("diagram");
    const paragraph = requiredNode("paragraph");
    if (dispatch) {
      const node = diagram.create({ model: createModel() });
      const transaction = state.tr.replaceSelectionWith(node);
      const insertedAt = findNodePosition(transaction.doc, node);
      if (insertedAt !== null) {
        const afterDiagram = insertedAt + node.nodeSize;
        if (!transaction.doc.resolve(afterDiagram).nodeAfter) {
          transaction.insert(afterDiagram, paragraph.create());
        }
        transaction.setSelection(NodeSelection.create(transaction.doc, insertedAt));
      }
      dispatch(transaction.scrollIntoView());
    }
    return true;
  };
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
 * `replaceSelectionWith` leaves the selection after the inserted node whenever
 * a text position exists there, so the node's own position has to be recovered
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

function rankCommands(commands: readonly SlashCommand[], query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  return commands
    .map((command, order) => ({ command, order, score: matchScore(command, needle) }))
    .filter((entry): entry is typeof entry & { score: number } => entry.score !== null)
    .sort((left, right) => left.score - right.score || left.order - right.order)
    .map((entry) => entry.command);
}

/**
 * Filters commands the way the v1 suggestion menu does: label and aliases both
 * match, prefix matches rank above substring matches, and the original
 * (grouped) order is kept as the tiebreak.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  return rankCommands(slashCommands, query);
}

export function filterEmojiCommands(query: string): SlashCommand[] {
  return rankCommands(emojiCommands, query).slice(0, EMOJI_RESULT_LIMIT);
}

export function filterSlashItems(trigger: SlashTrigger, query: string): SlashCommand[] {
  return trigger === ":" ? filterEmojiCommands(query) : filterSlashCommands(query);
}

/**
 * Removes the typed trigger and runs the command, returning the command's
 * `action` when it needs host state the `Command` signature cannot reach (the
 * workspace store and active note id). The caller performs that follow-up.
 */
export function applySlashCommand(
  view: EditorView,
  command: SlashCommand,
  trigger: SlashTrigger = "/",
): SlashAction | null {
  const { $from } = view.state.selection;
  const start = $from.start();
  const before = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
  const triggerIndex = before.lastIndexOf(trigger);
  const from = triggerIndex >= 0 ? start + triggerIndex : start;
  view.dispatch(view.state.tr.delete(from, $from.pos));
  if (!command.action) {
    command.command(view.state, view.dispatch);
  }
  view.focus();
  return command.action ?? null;
}
