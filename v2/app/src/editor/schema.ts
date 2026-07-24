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
import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
} from "prosemirror-markdown";
import {
  Schema,
  type Node as ProseMirrorNode,
  type NodeSpec,
} from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { addListNodes, liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { createSearchPlugin } from "./search-plugin";

export type SlashMenuState = {
  open: boolean;
  query: string;
};

const HISTORY_GROUP_DELAY_MS = 500;
const HISTORY_DEPTH = 200;

const tagRefSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  attrs: {
    id: {},
    label: { default: "" },
  },
  toDOM: (node) => [
    "span",
    {
      class: "reference-token reference-token-tag",
      "data-ref-kind": "tag",
      "data-ref-id": String(node.attrs.id),
      "data-ref-label": String(node.attrs.label),
    },
    `#${node.attrs.label}`,
  ],
  parseDOM: [
    {
      tag: "span[data-ref-kind='tag']",
      getAttrs: (dom) => {
        const id = dom.getAttribute("data-ref-id");
        return id
          ? { id, label: dom.getAttribute("data-ref-label") ?? "" }
          : false;
      },
    },
  ],
};

const mentionRefSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  attrs: {
    kind: {},
    id: {},
    label: { default: "" },
  },
  toDOM: (node) => [
    "span",
    {
      class: `reference-token reference-token-${node.attrs.kind}`,
      "data-ref-kind": String(node.attrs.kind),
      "data-ref-id": String(node.attrs.id),
      "data-ref-label": String(node.attrs.label),
    },
    `${node.attrs.kind === "person" ? "$" : "@"}${node.attrs.label}`,
  ],
  parseDOM: [
    {
      tag: "span[data-ref-kind='person'], span[data-ref-kind='note']",
      getAttrs: (dom) => {
        const id = dom.getAttribute("data-ref-id");
        const kind = dom.getAttribute("data-ref-kind");
        return id && (kind === "person" || kind === "note")
          ? { kind, id, label: dom.getAttribute("data-ref-label") ?? "" }
          : false;
      },
    },
  ],
};

const imageRefSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    id: {},
    alt: { default: "" },
    width: { default: null },
    height: { default: null },
  },
  toDOM: (node) => [
    "img",
    {
      class: "note-image",
      "data-image-id": String(node.attrs.id),
      alt: String(node.attrs.alt),
      ...(node.attrs.width ? { width: String(node.attrs.width) } : {}),
      ...(node.attrs.height ? { height: String(node.attrs.height) } : {}),
    },
  ],
  parseDOM: [
    {
      tag: "img[data-image-id]",
      getAttrs: (dom) => {
        const id = dom.getAttribute("data-image-id");
        return id
          ? {
              id,
              alt: dom.getAttribute("alt") ?? "",
              width: Number(dom.getAttribute("width")) || null,
              height: Number(dom.getAttribute("height")) || null,
            }
          : false;
      },
    },
  ],
};

const nodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")
  .addToEnd("tag_ref", tagRefSpec)
  .addToEnd("mention_ref", mentionRefSpec)
  .addToEnd("image_ref", imageRefSpec);

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

export function isDocEmpty(doc: ProseMirrorNode): boolean {
  return (
    doc.childCount === 1 &&
    doc.firstChild !== null &&
    doc.firstChild.type.name === "paragraph" &&
    doc.firstChild.childCount === 0
  );
}

function createPlaceholderPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const first = state.doc.firstChild;
        if (!first || !isDocEmpty(state.doc)) {
          return null;
        }
        return DecorationSet.create(state.doc, [
          Decoration.node(0, first.nodeSize, { class: "is-editor-empty" }),
        ]);
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
    createPlaceholderPlugin(),
    createSearchPlugin(),
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

const productMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    tag_ref(state, node) {
      state.text(`#${node.attrs.label}`, false);
    },
    mention_ref(state, node) {
      state.text(`${node.attrs.kind === "person" ? "$" : "@"}${node.attrs.label}`, false);
    },
    image_ref(state, node) {
      state.write(
        `![${state.esc(String(node.attrs.alt))}](images/${node.attrs.id})`,
      );
    },
  },
  defaultMarkdownSerializer.marks,
);

export function serializeProductMarkdown(document: ProseMirrorNode): string {
  return productMarkdownSerializer.serialize(document);
}

const productMarkdownParser = new MarkdownParser(
  productSchema,
  defaultMarkdownParser.tokenizer,
  defaultMarkdownParser.tokens,
);

function plainParagraphDocument(markdown: string): ProseMirrorNode {
  const paragraphs = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => productSchema.node("paragraph", null, [productSchema.text(line)]));
  return productSchema.node(
    "doc",
    null,
    paragraphs.length > 0 ? paragraphs : [productSchema.node("paragraph")],
  );
}

export function parseProductMarkdown(markdown: string): ProseMirrorNode {
  if (markdown.trim().length === 0) {
    return plainParagraphDocument("");
  }
  try {
    return productMarkdownParser.parse(markdown);
  } catch {
    return plainParagraphDocument(markdown);
  }
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
