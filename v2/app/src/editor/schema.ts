import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import {
  ellipsis,
  emDash,
  InputRule,
  inputRules,
  smartQuotes,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
} from "prosemirror-markdown";
import {
  Schema,
  type MarkSpec,
  type MarkType,
  type Node as ProseMirrorNode,
  type NodeSpec,
} from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import { findWrapping } from "prosemirror-transform";
import { moveSelectedBlock } from "./block-commands";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { addListNodes, liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import {
  columnResizing,
  goToNextCell,
  tableEditing,
  tableNodes,
} from "prosemirror-tables";
import { createCodeHighlightPlugin } from "./code-highlight";
import { createSearchPlugin } from "./search-plugin";

export type SlashMenuState = {
  open: boolean;
  query: string;
};

const HISTORY_GROUP_DELAY_MS = 500;
const HISTORY_DEPTH = 200;

export const textAlignments = ["left", "center", "right"] as const;

export type TextAlignment = (typeof textAlignments)[number];

export const highlightColors = {
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
  orange: "#fed7aa",
  purple: "#ddd6fe",
} as const;

export type HighlightColor = keyof typeof highlightColors;

function isTextAlignment(value: unknown): value is TextAlignment {
  return typeof value === "string" && textAlignments.includes(value as TextAlignment);
}

function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === "string" && value in highlightColors;
}

function textAlignmentFromDom(dom: HTMLElement): TextAlignment {
  const value = dom.getAttribute("data-text-align") ?? dom.style.textAlign;
  return isTextAlignment(value) ? value : "left";
}

function textAlignmentAttributes(node: ProseMirrorNode): Record<string, string> {
  const textAlign = isTextAlignment(node.attrs.textAlign) ? node.attrs.textAlign : "left";
  return textAlign === "left"
    ? { "data-text-align": textAlign }
    : { "data-text-align": textAlign, style: `text-align: ${textAlign}` };
}

const paragraphSpec: NodeSpec = {
  ...basicSchema.spec.nodes.get("paragraph"),
  attrs: {
    textAlign: { default: "left" },
  },
  toDOM: (node) => ["p", textAlignmentAttributes(node), 0],
  parseDOM: [
    {
      tag: "p",
      getAttrs: (dom) => ({ textAlign: textAlignmentFromDom(dom) }),
    },
  ],
};

const headingSpec: NodeSpec = {
  ...basicSchema.spec.nodes.get("heading"),
  attrs: {
    level: { default: 1 },
    textAlign: { default: "left" },
  },
  toDOM: (node) => [
    `h${node.attrs.level}`,
    textAlignmentAttributes(node),
    0,
  ],
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs: (dom: HTMLElement) => ({ level, textAlign: textAlignmentFromDom(dom) }),
  })),
};

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

const checkListSpec: NodeSpec = {
  content: "check_item+",
  group: "block",
  toDOM: () => ["ul", { class: "check-list", "data-check-list": "true" }, 0],
  parseDOM: [{ tag: "ul[data-check-list]", priority: 60 }],
};

const checkItemSpec: NodeSpec = {
  content: "paragraph block*",
  defining: true,
  attrs: {
    checked: { default: false },
  },
  toDOM: (node) => [
    "li",
    {
      class: "check-item",
      "data-checked": node.attrs.checked ? "true" : "false",
    },
    [
      "span",
      {
        class: "check-item-box",
        contenteditable: "false",
        role: "checkbox",
        "aria-checked": node.attrs.checked ? "true" : "false",
      },
    ],
    ["div", { class: "check-item-content" }, 0],
  ],
  parseDOM: [
    {
      tag: "li[data-checked]",
      priority: 60,
      getAttrs: (dom) => ({ checked: dom.getAttribute("data-checked") === "true" }),
    },
  ],
};

const LANGUAGE_CLASS = /(?:^|\s)language-(\S+)/;

function codeBlockLanguage(dom: HTMLElement): string {
  const declared = dom.getAttribute("data-language");
  if (declared) return declared;
  const code = dom.querySelector("code");
  const source = code ?? dom;
  const fromData = source.getAttribute("data-language");
  if (fromData) return fromData;
  return source.getAttribute("class")?.match(LANGUAGE_CLASS)?.[1] ?? "";
}

const codeBlockSpec: NodeSpec = {
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  attrs: {
    params: { default: "" },
  },
  toDOM: (node) => [
    "pre",
    { "data-language": String(node.attrs.params) || null },
    ["code", 0],
  ],
  parseDOM: [
    {
      tag: "pre",
      preserveWhitespace: "full",
      getAttrs: (dom) => ({ params: codeBlockLanguage(dom) }),
    },
  ],
};

const strikethroughSpec: MarkSpec = {
  parseDOM: [
    { tag: "s" },
    { tag: "del" },
    { tag: "strike" },
    { style: "text-decoration=line-through" },
  ],
  toDOM: () => ["s", 0],
};

const underlineSpec: MarkSpec = {
  parseDOM: [
    { tag: "u" },
    { tag: "ins" },
    { style: "text-decoration=underline" },
  ],
  toDOM: () => ["u", 0],
};

const highlightSpec: MarkSpec = {
  attrs: {
    color: { default: "yellow" },
  },
  parseDOM: [
    {
      tag: "mark",
      getAttrs: (dom) => {
        const color = dom.getAttribute("data-skriuw-highlight");
        return { color: isHighlightColor(color) ? color : "yellow" };
      },
    },
  ],
  toDOM: (mark) => {
    const color = isHighlightColor(mark.attrs.color) ? mark.attrs.color : "yellow";
    return [
      "mark",
      {
        "data-skriuw-highlight": color,
        style: `background-color: ${highlightColors[color]}`,
      },
      0,
    ];
  },
};

const tableSpecs = tableNodes({
  tableGroup: "block",
  cellContent: "block+",
  cellAttributes: {},
});

const nodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")
  .update("paragraph", paragraphSpec)
  .update("heading", headingSpec)
  .update("code_block", codeBlockSpec)
  .addToEnd("check_list", checkListSpec)
  .addToEnd("check_item", checkItemSpec)
  .addToEnd("tag_ref", tagRefSpec)
  .addToEnd("mention_ref", mentionRefSpec)
  .addToEnd("image_ref", imageRefSpec)
  .addToEnd("table", tableSpecs.table)
  .addToEnd("table_row", tableSpecs.table_row)
  .addToEnd("table_cell", tableSpecs.table_cell)
  .addToEnd("table_header", tableSpecs.table_header);

export const productSchema = new Schema({
  nodes,
  marks: basicSchema.spec.marks
    .addToEnd("strikethrough", strikethroughSpec)
    .addToEnd("underline", underlineSpec)
    .addToEnd("highlight", highlightSpec),
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
        if ($from.parent.type.spec.code) return { open: false, query: "" };
        const before = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
        const match = before.match(/(?:^|[\s\0])\/([a-z0-9-]*)$/i);
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

/**
 * Converts inline markdown delimiters into a mark as the closing delimiter is
 * typed (e.g. `**bold**`). `match[1]` must capture the marked content and the
 * match must end with the closing delimiter; anything before the opening
 * delimiter is left untouched.
 */
function markInputRule(
  pattern: RegExp,
  markType: MarkType,
  delimiterLength: number,
): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const content = match[1] ?? "";
    if (!content) return null;
    if (state.doc.resolve(start).parent.type.spec.code) return null;
    const prefix = match[0].length - content.length - delimiterLength * 2;
    const openStart = start + prefix;
    const contentStart = openStart + delimiterLength;
    const contentEnd = contentStart + content.length;
    const codeMark = productSchema.marks.code;
    if (
      codeMark &&
      markType !== codeMark &&
      state.doc.rangeHasMark(contentStart, Math.min(contentEnd, end), codeMark)
    ) {
      return null;
    }
    const tr = state.tr;
    if (contentEnd < end) tr.delete(contentEnd, end);
    tr.delete(openStart, contentStart);
    tr.addMark(openStart, openStart + content.length, markType.create());
    tr.removeStoredMark(markType);
    return tr;
  });
}

function horizontalRuleInputRule(): InputRule {
  return new InputRule(/^(?:---|—-|___|\*\*\*)$/, (state, _match, start, end) => {
    const horizontalRule = productSchema.nodes.horizontal_rule;
    const paragraph = productSchema.nodes.paragraph;
    if (!horizontalRule || !paragraph) return null;
    const tr = state.tr.replaceRangeWith(start, end, horizontalRule.create());
    const afterRule = tr.mapping.map(end);
    if (!tr.doc.resolve(afterRule).nodeAfter) {
      tr.insert(afterRule, paragraph.create());
    }
    tr.setSelection(TextSelection.near(tr.doc.resolve(afterRule), 1));
    return tr.scrollIntoView();
  });
}

function checkListInputRule(): InputRule {
  return new InputRule(/^\s*\[([ xX])?\]\s$/, (state, match, start, end) => {
    const checkList = productSchema.nodes.check_list;
    if (!checkList) return null;
    if (state.doc.resolve(start).parent.type.spec.code) return null;
    const tr = state.tr.delete(start, end);
    const range = tr.doc.resolve(start).blockRange();
    if (!range) return null;
    const wrapping = findWrapping(range, checkList);
    if (!wrapping) return null;
    tr.wrap(range, wrapping);
    if ((match[1] ?? "").toLowerCase() === "x") {
      tr.setNodeMarkup(range.start + 1, undefined, { checked: true });
    }
    return tr;
  });
}

function linkInputRule(): InputRule {
  return new InputRule(/\[([^\[\]]+)\]\(([^()\s]+)\)$/, (state, match, start, end) => {
    const link = productSchema.marks.link;
    const text = match[1] ?? "";
    const href = match[2] ?? "";
    if (!link || !text || !href) return null;
    if (state.doc.resolve(start).parent.type.spec.code) return null;
    const codeMark = productSchema.marks.code;
    if (codeMark && state.doc.rangeHasMark(start, end, codeMark)) return null;
    const tr = state.tr.delete(start, end).insertText(text, start);
    tr.addMark(start, start + text.length, link.create({ href }));
    tr.removeStoredMark(link);
    return tr;
  });
}

const AUTOLINK_PATTERN =
  /(?:^|[\s(])((?:https?:\/\/|www\.)[^\s<>]*[^\s<>.,;:!?)])(\s)$/;

/**
 * Links a bare URL once the word is closed by whitespace. Input rules run
 * before the trigger character reaches the document, so the whitespace has to
 * be re-inserted here or typing it would be swallowed.
 */
function autolinkInputRule(): InputRule {
  return new InputRule(AUTOLINK_PATTERN, (state, match, start, end) => {
    const link = productSchema.marks.link;
    const url = match[1] ?? "";
    const trailing = match[2] ?? "";
    if (!link || !url) return null;
    const from = start + match[0].indexOf(url);
    const to = from + url.length;
    if (state.doc.rangeHasMark(from, to, link)) return null;
    const tr = state.tr.addMark(from, to, link.create({ href: normalizeAutolink(url) }));
    tr.removeStoredMark(link);
    tr.insertText(trailing, end);
    return tr;
  });
}

export function normalizeAutolink(url: string): string {
  return url.startsWith("www.") ? `https://${url}` : url;
}

const PASTED_URL_PATTERN = /^(?:https?:\/\/|www\.)[^\s<>]+$/;

/**
 * Links the selected text when the pasted clipboard content is a bare URL,
 * rather than replacing the selection with the URL. Returns false when the
 * paste should fall through to the default handling.
 */
export function linkPastedText(view: EditorView, text: string): boolean {
  const link = productSchema.marks.link;
  const { selection } = view.state;
  const trimmed = text.trim();
  if (!link || selection.empty || !(selection instanceof TextSelection)) return false;
  if (!PASTED_URL_PATTERN.test(trimmed)) return false;
  if (selection.$from.parent.type.spec.code) return false;
  view.dispatch(
    view.state.tr
      .addMark(
        selection.from,
        selection.to,
        link.create({ href: normalizeAutolink(trimmed) }),
      )
      .removeStoredMark(link),
  );
  return true;
}

function createCheckboxTogglePlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target;
          if (
            !(target instanceof HTMLElement) ||
            !target.classList.contains("check-item-box") ||
            !view.editable
          ) {
            return false;
          }
          event.preventDefault();
          const $pos = view.state.doc.resolve(view.posAtDOM(target, 0));
          for (let depth = $pos.depth; depth > 0; depth -= 1) {
            const node = $pos.node(depth);
            if (node.type.name === "check_item") {
              view.dispatch(
                view.state.tr.setNodeMarkup($pos.before(depth), undefined, {
                  checked: !node.attrs.checked,
                }),
              );
              return true;
            }
          }
          return false;
        },
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
  const checkItem = productSchema.nodes.check_item;
  if (
    !blockquote ||
    !codeBlock ||
    !heading ||
    !bulletList ||
    !orderedList ||
    !listItem ||
    !checkItem
  ) {
    throw new Error("product schema is missing a required block node");
  }
  const strong = productSchema.marks.strong;
  const em = productSchema.marks.em;
  const code = productSchema.marks.code;
  const strikethrough = productSchema.marks.strikethrough;
  const underline = productSchema.marks.underline;
  if (!strong || !em || !code || !strikethrough || !underline) {
    throw new Error("product schema is missing a required mark");
  }
  return [
    history({ newGroupDelay: HISTORY_GROUP_DELAY_MS, depth: HISTORY_DEPTH }),
    createSlashMenuPlugin(),
    createPlaceholderPlugin(),
    createSearchPlugin(),
    createCodeHighlightPlugin(),
    createCheckboxTogglePlugin(),
    inputRules({
      rules: [
        ...smartQuotes,
        ellipsis,
        emDash,
        checkListInputRule(),
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
        horizontalRuleInputRule(),
        linkInputRule(),
        autolinkInputRule(),
        markInputRule(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, strong, 2),
        markInputRule(/(?:^|[^_])__([^_\s](?:[^_]*[^_\s])?)__$/, strong, 2),
        markInputRule(/~~([^~\s](?:[^~]*[^~\s])?)~~$/, strikethrough, 2),
        markInputRule(/(?:^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, em, 1),
        markInputRule(/(?:^|[^\w])_([^_\s](?:[^_]*[^_\s])?)_$/, em, 1),
        markInputRule(/`([^`\s](?:[^`]*[^`\s])?)`$/, code, 1),
      ],
    }),
    keymap({
      "Mod-z": undo,
      "Shift-Mod-z": redo,
      "Mod-y": redo,
      "Mod-b": toggleMark(strong),
      "Mod-i": toggleMark(em),
      "Mod-e": toggleMark(code),
      "Mod-Shift-x": toggleMark(strikethrough),
      "Mod-u": toggleMark(underline),
      "Alt-ArrowUp": moveSelectedBlock(-1),
      "Alt-ArrowDown": moveSelectedBlock(1),
      Enter: chainCommands(
        splitListItem(checkItem, { checked: false }),
        splitListItem(listItem),
      ),
      Tab: chainCommands(
        sinkListItem(checkItem),
        sinkListItem(listItem),
        goToNextCell(1),
      ),
      "Shift-Tab": chainCommands(
        liftListItem(checkItem),
        liftListItem(listItem),
        goToNextCell(-1),
      ),
    }),
    keymap(baseKeymap),
    columnResizing(),
    tableEditing(),
    dropCursor({ color: "hsl(var(--primary))", width: 2 }),
    gapCursor(),
  ];
}

export function slashMenuState(state: EditorState): SlashMenuState {
  return slashMenuKey.getState(state) ?? { open: false, query: "" };
}

/**
 * Renders one table cell as a single line of inline Markdown. A cell holding a
 * single paragraph keeps its inline marks; anything richer (lists, nested
 * tables, several blocks) has no GFM pipe-table equivalent and is flattened to
 * plain text rather than emitting a broken table.
 */
function serializeTableCell(cell: ProseMirrorNode): string {
  const only = cell.childCount === 1 ? cell.firstChild : null;
  const rendered = only && only.type.name === "paragraph"
    ? productMarkdownSerializer.serialize(productSchema.node("doc", null, [only]))
    : cell.textBetween(0, cell.content.size, " ", " ");
  return rendered.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim();
}

function serializeTableRow(row: ProseMirrorNode): string[] {
  const cells: string[] = [];
  row.forEach((cell) => {
    cells.push(serializeTableCell(cell));
    const span = Number(cell.attrs.colspan) || 1;
    for (let extra = 1; extra < span; extra += 1) cells.push("");
  });
  return cells;
}

function pipeRow(cells: readonly string[], width: number): string {
  const padded = Array.from({ length: width }, (_, index) => cells[index] ?? "");
  return `| ${padded.join(" | ")} |`;
}

function textAlignmentMarker(node: ProseMirrorNode): string {
  const textAlign = isTextAlignment(node.attrs.textAlign) ? node.attrs.textAlign : "left";
  return textAlign === "left" ? "" : `<!--skriuw-align:${textAlign}-->`;
}

const productMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    paragraph(state, node) {
      state.write(textAlignmentMarker(node));
      state.renderInline(node);
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write(`${state.repeat("#", node.attrs.level)} ${textAlignmentMarker(node)}`);
      state.renderInline(node, false);
      state.closeBlock(node);
    },
    table(state, node) {
      const rows: string[][] = [];
      node.forEach((row) => rows.push(serializeTableRow(row)));
      const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
      if (width === 0) {
        state.closeBlock(node);
        return;
      }
      state.write(pipeRow(rows[0] ?? [], width));
      state.ensureNewLine();
      state.write(pipeRow(Array.from({ length: width }, () => "---"), width));
      state.ensureNewLine();
      for (const row of rows.slice(1)) {
        state.write(pipeRow(row, width));
        state.ensureNewLine();
      }
      state.closeBlock(node);
    },
    code_block(state, node) {
      const backticks = node.textContent.match(/`{3,}/gm);
      const fence = backticks ? `${backticks.sort().slice(-1)[0]}\`` : "```";
      state.write(`${fence}${String(node.attrs.params ?? "")}\n`);
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write(fence);
      state.closeBlock(node);
    },
    check_list(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    check_item(state, node) {
      state.write(node.attrs.checked ? "[x] " : "[ ] ");
      state.renderContent(node);
    },
    tag_ref(state, node) {
      state.text(`#${node.attrs.label}`, false);
    },
    mention_ref(state, node) {
      if (node.attrs.kind === "person") {
        state.text(`$${node.attrs.label}`, false);
      } else {
        state.text(`[[${node.attrs.label}]]`, false);
      }
    },
    image_ref(state, node) {
      state.write(
        `![${state.esc(String(node.attrs.alt))}](images/${node.attrs.id})`,
      );
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    strikethrough: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    underline: {
      open: "<u>",
      close: "</u>",
    },
    highlight: {
      open: (_state, mark) => {
        const color = isHighlightColor(mark.attrs.color) ? mark.attrs.color : "yellow";
        return `<mark data-skriuw-highlight="${color}">`;
      },
      close: "</mark>",
    },
  },
);

export function serializeProductMarkdown(document: ProseMirrorNode): string {
  return productMarkdownSerializer.serialize(document);
}

function inlineWikiLinkRule(state: any, silent: boolean): boolean {
  const max = state.posMax;
  const start = state.pos;

  if (
    state.src.charCodeAt(start) !== 0x5B /* [ */ ||
    state.src.charCodeAt(start + 1) !== 0x5B /* [ */
  ) {
    return false;
  }

  const contentStart = start + 2;
  const matchEnd = state.src.indexOf("]]", contentStart);
  if (matchEnd === -1 || matchEnd >= max) {
    return false;
  }

  const nextChar = state.src.charCodeAt(matchEnd + 2);
  if (nextChar === 0x28 /* ( */ || nextChar === 0x5B /* [ */) {
    return false;
  }

  const label = state.src.slice(contentStart, matchEnd);
  if (!label || label.includes("\n")) {
    return false;
  }

  if (!silent) {
    const token = state.push("wiki_link", "", 0);
    token.content = label;
  }

  state.pos = matchEnd + 2;
  return true;
}

if (!(defaultMarkdownParser.tokenizer.inline.ruler as any).__rules?.some((r: any) => r.name === "wiki_link")) {
  defaultMarkdownParser.tokenizer.inline.ruler.before("link", "wiki_link", inlineWikiLinkRule);
}

function richFormattingTagRule(state: any, silent: boolean): boolean {
  const source = state.src.slice(state.pos, state.posMax);
  const underline = source.match(/^<(\/?)u>/i);
  if (underline) {
    if (!silent) {
      state.push(
        underline[1] ? "skriuw_underline_close" : "skriuw_underline_open",
        "u",
        underline[1] ? -1 : 1,
      );
    }
    state.pos += underline[0].length;
    return true;
  }
  const highlight = source.match(/^<(\/?)mark(?:\s+data-skriuw-highlight=["']([a-z]+)["'])?>/i);
  if (!highlight) return false;
  const color = highlight[2]?.toLowerCase();
  if (!highlight[1] && !isHighlightColor(color)) return false;
  if (!silent) {
    const token = state.push(
      highlight[1] ? "skriuw_highlight_close" : "skriuw_highlight_open",
      "mark",
      highlight[1] ? -1 : 1,
    );
    if (!highlight[1]) token.meta = { color };
  }
  state.pos += highlight[0].length;
  return true;
}

if (!(defaultMarkdownParser.tokenizer.inline.ruler as any).__rules?.some((r: any) => r.name === "skriuw_rich_formatting")) {
  defaultMarkdownParser.tokenizer.inline.ruler.before("text", "skriuw_rich_formatting", richFormattingTagRule);
}

/**
 * The parser is built on markdown-it's commonmark preset, which disables both
 * of these core rules outright — setting the `linkify` option alone silently
 * does nothing without enabling the rule as well.
 *
 * Fuzzy linkification stays off deliberately: it turns any bare `word.word`
 * into a link, which fires on ordinary prose (filenames, abbreviations) far
 * more often than on real URLs. Only scheme-prefixed and `www.` URLs link.
 */
/**
 * markdown-it emits a bare `inline` token inside `th`/`td`, but `table_cell`
 * holds `block+`, so the text would have nowhere to land and the cell would be
 * dropped by `createAndFill`. Wrapping the inline run in paragraph tokens keeps
 * the cell content valid without a bespoke token handler.
 */
function wrapTableCellContent(state: any): boolean {
  const tokens = state.tokens;
  const wrapped: any[] = [];
  let inCell = false;
  for (const token of tokens) {
    if (token.type === "th_open" || token.type === "td_open") inCell = true;
    if (inCell && token.type === "inline") {
      wrapped.push(new state.Token("paragraph_open", "p", 1));
      wrapped.push(token);
      wrapped.push(new state.Token("paragraph_close", "p", -1));
      inCell = false;
      continue;
    }
    if (token.type === "th_close" || token.type === "td_close") inCell = false;
    wrapped.push(token);
  }
  state.tokens = wrapped;
  return true;
}

if (!(defaultMarkdownParser.tokenizer.core.ruler as any).__rules?.some((r: any) => r.name === "table_cell_paragraphs")) {
  defaultMarkdownParser.tokenizer.core.ruler.push("table_cell_paragraphs", wrapTableCellContent);
}

function applyTextAlignmentMarkers(state: any): boolean {
  const tokens = state.tokens;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const opening = tokens[index];
    const inline = tokens[index + 1];
    if (
      (opening.type !== "paragraph_open" && opening.type !== "heading_open") ||
      inline.type !== "inline"
    ) {
      continue;
    }
    const first = inline.children?.[0];
    if (first?.type !== "text") continue;
    const match = first.content.match(/^<!--skriuw-align:(center|right)-->/);
    if (!match) continue;
    first.content = first.content.slice(match[0].length);
    opening.meta = { ...(opening.meta ?? {}), textAlign: match[1] };
  }
  return true;
}

if (!(defaultMarkdownParser.tokenizer.core.ruler as any).__rules?.some((r: any) => r.name === "skriuw_text_alignment")) {
  defaultMarkdownParser.tokenizer.core.ruler.push("skriuw_text_alignment", applyTextAlignmentMarkers);
}

defaultMarkdownParser.tokenizer.enable(["strikethrough", "linkify", "table"], true);
defaultMarkdownParser.tokenizer.set({ linkify: true });
defaultMarkdownParser.tokenizer.linkify.set({
  fuzzyLink: false,
  fuzzyEmail: false,
  fuzzyIP: false,
});

const productMarkdownParser = new MarkdownParser(
  productSchema,
  defaultMarkdownParser.tokenizer,
  {
    ...defaultMarkdownParser.tokens,
    s: { mark: "strikethrough" },
    paragraph: {
      block: "paragraph",
      getAttrs: (tok: any) => ({ textAlign: tok.meta?.textAlign ?? "left" }),
    },
    heading: {
      block: "heading",
      getAttrs: (tok: any) => ({
        level: +tok.tag.slice(1),
        textAlign: tok.meta?.textAlign ?? "left",
      }),
    },
    skriuw_underline: { mark: "underline" },
    skriuw_highlight: {
      mark: "highlight",
      getAttrs: (tok: any) => ({ color: tok.meta?.color ?? "yellow" }),
    },
    table: { block: "table" },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: "table_row" },
    th: { block: "table_header" },
    td: { block: "table_cell" },
    wiki_link: {
      node: "mention_ref",
      getAttrs: (tok: any) => ({
        kind: "note",
        id: tok.content,
        label: tok.content,
      }),
    },
  },
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

const CHECKBOX_PREFIX = /^\[([ xX])\] /;

type JsonNode = {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown[];
  text?: unknown;
  [key: string]: unknown;
};

function checkboxPrefix(item: JsonNode): RegExpMatchArray | null {
  if (item.type !== "list_item") return null;
  const paragraph = item.content?.[0] as JsonNode | undefined;
  if (paragraph?.type !== "paragraph") return null;
  const text = paragraph.content?.[0] as JsonNode | undefined;
  if (text?.type !== "text" || typeof text.text !== "string") return null;
  return text.text.match(CHECKBOX_PREFIX);
}

function toCheckItem(item: JsonNode, prefix: RegExpMatchArray): JsonNode {
  const paragraph = item.content?.[0] as JsonNode;
  const text = paragraph.content?.[0] as JsonNode;
  const stripped = (text.text as string).slice(prefix[0].length);
  const inline = stripped.length > 0
    ? [{ ...text, text: stripped }, ...(paragraph.content?.slice(1) ?? [])]
    : paragraph.content?.slice(1) ?? [];
  return {
    type: "check_item",
    attrs: { checked: prefix[1]?.toLowerCase() === "x" },
    content: [
      { ...paragraph, content: inline },
      ...(item.content?.slice(1) ?? []),
    ],
  };
}

/**
 * CommonMark has no task-list syntax, so `- [ ] thing` parses as a plain
 * bullet item whose text starts with the checkbox marker. Rewrites runs of
 * such items into `check_list`/`check_item` nodes, splitting mixed bullet
 * lists into adjacent lists so plain items stay bullets.
 */
function upgradeCheckLists(node: unknown): unknown[] {
  if (node === null || typeof node !== "object") return [node];
  const record = node as JsonNode;
  const content = Array.isArray(record.content)
    ? record.content.flatMap((child) => upgradeCheckLists(child))
    : record.content;
  if (record.type !== "bullet_list" || !Array.isArray(content)) {
    return [content === record.content ? record : { ...record, content }];
  }
  const runs: JsonNode[] = [];
  for (const child of content as JsonNode[]) {
    const prefix = checkboxPrefix(child);
    const type = prefix ? "check_list" : "bullet_list";
    const item = prefix ? toCheckItem(child, prefix) : child;
    const last = runs[runs.length - 1];
    if (last && last.type === type) {
      (last.content as JsonNode[]).push(item);
    } else {
      runs.push(
        type === "check_list"
          ? { type, content: [item] }
          : { ...record, content: [item] },
      );
    }
  }
  return runs;
}

export function parseProductMarkdown(markdown: string): ProseMirrorNode {
  if (markdown.trim().length === 0) {
    return plainParagraphDocument("");
  }
  try {
    const parsed = productMarkdownParser.parse(markdown);
    try {
      const [upgraded] = upgradeCheckLists(parsed.toJSON());
      return productSchema.nodeFromJSON(upgraded);
    } catch {
      return parsed;
    }
  } catch {
    return plainParagraphDocument(markdown);
  }
}

const IMAGE_PATH_PREFIX = "images/";

/**
 * `image` nodes are what the CommonMark image syntax parses to; only
 * `image_ref` nodes are bound to a workspace image blob. Relinks any parsed
 * `image` node whose `images/<id>` path matches a known blob back to
 * `image_ref`, so raw-Markdown round-tripping doesn't orphan note images.
 */
function relinkImageNode(node: unknown, knownImageIds: ReadonlySet<string>): unknown {
  if (node === null || typeof node !== "object") {
    return node;
  }
  const record = node as Record<string, unknown>;
  if (record.type === "image") {
    const attrs = record.attrs as Record<string, unknown> | undefined;
    const src = typeof attrs?.src === "string" ? attrs.src : "";
    if (src.startsWith(IMAGE_PATH_PREFIX)) {
      const id = src.slice(IMAGE_PATH_PREFIX.length);
      if (knownImageIds.has(id)) {
        return {
          type: "image_ref",
          attrs: { id, alt: typeof attrs?.alt === "string" ? attrs.alt : "" },
        };
      }
    }
  }
  if (Array.isArray(record.content)) {
    return {
      ...record,
      content: record.content.map((child) => relinkImageNode(child, knownImageIds)),
    };
  }
  return record;
}

export function parseProductMarkdownWithImages(
  markdown: string,
  knownImageIds: ReadonlySet<string>,
): ProseMirrorNode {
  const parsed = parseProductMarkdown(markdown);
  try {
    return productSchema.nodeFromJSON(relinkImageNode(parsed.toJSON(), knownImageIds));
  } catch {
    return parsed;
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
