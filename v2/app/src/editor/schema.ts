import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import {
  ellipsis,
  emDash,
  inputRules,
  smartQuotes,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { defaultMarkdownSerializer } from "prosemirror-markdown";
import { Schema, type Node as ProseMirrorNode } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { addListNodes, liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";

export type SlashMenuState = {
  open: boolean;
  query: string;
};

const HISTORY_GROUP_DELAY_MS = 500;
const HISTORY_DEPTH = 200;

const nodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block");

export const productSchema = new Schema({
  nodes,
  marks: basicSchema.spec.marks,
});

export const slashMenuKey = new PluginKey<SlashMenuState>("skriuw-slash-menu");

function createSlashMenuPlugin(): Plugin<SlashMenuState> {
  return new Plugin<SlashMenuState>({
    key: slashMenuKey,
    state: {
      init: (): SlashMenuState => ({ open: false, query: "" }),
      apply(transaction, previous) {
        if (!transaction.docChanged && !transaction.selectionSet) return previous;
        const { $from } = transaction.selection;
        if (!$from.parent.isTextblock) return { open: false, query: "" };
        const before = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
        const match = before.match(/^\/([a-z-]*)$/i);
        return match
          ? { open: true, query: match[1] ?? "" }
          : { open: false, query: "" };
      },
    },
  });
}

export function createProductPlugins(): Plugin[] {
  const blockquote = productSchema.nodes.blockquote;
  const codeBlock = productSchema.nodes.code_block;
  const heading = productSchema.nodes.heading;
  const bulletList = productSchema.nodes.bullet_list;
  const orderedList = productSchema.nodes.ordered_list;
  const listItem = productSchema.nodes.list_item;
  if (!blockquote || !codeBlock || !heading || !bulletList || !orderedList || !listItem) {
    throw new Error("product schema is missing a required block node");
  }
  return [
    history({ newGroupDelay: HISTORY_GROUP_DELAY_MS, depth: HISTORY_DEPTH }),
    createSlashMenuPlugin(),
    inputRules({
      rules: [
        ...smartQuotes,
        ellipsis,
        emDash,
        textblockTypeInputRule(/^(#{1,6})\s$/, heading, (match) => ({
          level: match[1]?.length ?? 1,
        })),
        wrappingInputRule(/^\s*([-+*])\s$/, bulletList),
        wrappingInputRule(
          /^(\d+)\.\s$/,
          orderedList,
          (match) => ({ order: Number(match[1] ?? 1) }),
          (match, node) => node.childCount + Number(node.attrs.order) === Number(match[1]),
        ),
        wrappingInputRule(/^\s*>\s$/, blockquote),
        textblockTypeInputRule(/^```$/, codeBlock),
      ],
    }),
    keymap({
      "Mod-z": undo,
      "Shift-Mod-z": redo,
      "Mod-y": redo,
      Enter: splitListItem(listItem),
      Tab: sinkListItem(listItem),
      "Shift-Tab": liftListItem(listItem),
    }),
    keymap(baseKeymap),
  ];
}

export function slashMenuState(state: EditorState): SlashMenuState {
  return slashMenuKey.getState(state) ?? { open: false, query: "" };
}

export function serializeProductMarkdown(document: ProseMirrorNode): string {
  return defaultMarkdownSerializer.serialize(document);
}

export function countWords(document: ProseMirrorNode): number {
  let words = 0;
  document.descendants((node) => {
    if (node.isText && node.text) {
      words += node.text.split(/\s+/).filter((word) => word.length > 0).length;
    }
    return true;
  });
  return words;
}
