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

type SlashMenuState = {
  open: boolean;
  query: string;
};

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
  const listItem = productSchema.nodes.list_item;
  if (!blockquote || !codeBlock || !listItem) {
    throw new Error("product schema is missing a required block node");
  }
  return [
    history(),
    createSlashMenuPlugin(),
    inputRules({
      rules: [
        ...smartQuotes,
        ellipsis,
        emDash,
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

export function createRepresentativeProductDocument(): ProseMirrorNode {
  const link = productSchema.marks.link;
  const strong = productSchema.marks.strong;
  const emphasis = productSchema.marks.em;
  const code = productSchema.marks.code;
  if (!link || !strong || !emphasis || !code) {
    throw new Error("product schema is missing a required inline mark");
  }
  return productSchema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Representative note" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "strong" }], text: "Strong" },
          { type: "text", text: ", " },
          { type: "text", marks: [{ type: "em" }], text: "emphasis" },
          { type: "text", text: ", " },
          { type: "text", marks: [{ type: "code" }], text: "inline code" },
          { type: "text", text: ", and a " },
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: "https://example.com", title: null } }],
            text: "link",
          },
          { type: "text", text: "." },
        ],
      },
      {
        type: "bullet_list",
        content: [
          {
            type: "list_item",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Bullet item" }] }],
          },
        ],
      },
      {
        type: "ordered_list",
        attrs: { order: 3 },
        content: [
          {
            type: "list_item",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Ordered item" }] }],
          },
        ],
      },
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted text" }] }],
      },
      {
        type: "code_block",
        content: [{ type: "text", text: "const ready = true;" }],
      },
      { type: "horizontal_rule" },
      { type: "paragraph", content: [{ type: "text", text: "Trailing paragraph" }] },
    ],
  });
}

export function serializeProductMarkdown(document: ProseMirrorNode): string {
  return defaultMarkdownSerializer.serialize(document);
}
