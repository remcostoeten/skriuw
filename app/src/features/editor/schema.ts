import {
  baseKeymap,
  chainCommands,
  createParagraphNear,
  exitCode,
  liftEmptyBlock,
  newlineInCode,
  splitBlock,
  toggleMark,
} from "prosemirror-commands";
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
  drawingFence,
  extractDrawingFence,
  isEmptyDrawingLayer,
  readDrawingPayload,
} from "./drawing-layer";
import {
  Schema,
  type MarkSpec,
  type MarkType,
  type Node as ProseMirrorNode,
  type NodeSpec,
} from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import { findWrapping } from "prosemirror-transform";
import { moveSelectedBlock, selectBlockThenDocument } from "./block-commands";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { addListNodes, liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import {
  columnResizing,
  goToNextCell,
  tableEditing,
  tableNodes,
} from "prosemirror-tables";
import { createCodeHighlightPlugin } from "./code-highlight";
import { createAnnotationDecorationPlugin } from "./annotation-decorations";
import { createSuggestionPlugin } from "./suggestion-decorations";
import { createSearchPlugin } from "./search-plugin";
import {
  createDefaultDiagram,
  parseMermaidFlowchart,
  readDiagramModel,
  serializeMermaidFlowchart,
} from "./diagram-model";
import { taskCheckItemAttrs } from "./task-promotion";

export type SlashTrigger = "/" | ":";

export type SlashMenuState = {
  open: boolean;
  trigger: SlashTrigger;
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

const blockedImageSpec: NodeSpec = {
  inline: true,
  group: "inline",
  draggable: true,
  attrs: {
    src: { default: null },
    alt: { default: null },
    title: { default: null },
  },
  toDOM: (node) => [
    "span",
    {
      class: "blocked-markdown-image",
      "data-image-src": String(node.attrs.src ?? ""),
      "data-image-alt": String(node.attrs.alt ?? ""),
      role: "img",
      "aria-label": `Remote image blocked: ${String(node.attrs.alt ?? node.attrs.src ?? "image")}`,
    },
    String(node.attrs.alt ?? "Remote image blocked"),
  ],
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom) => ({
        src: dom.getAttribute("src"),
        alt: dom.getAttribute("alt"),
        title: dom.getAttribute("title"),
      }),
    },
  ],
};

export const mediaKinds = ["video", "audio", "file"] as const;

export type MediaKind = (typeof mediaKinds)[number];

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && mediaKinds.includes(value as MediaKind);
}

/**
 * Derives the label shown for a media embed from its URL, so a freshly pasted
 * link reads as a file name rather than the whole address.
 */
export function mediaTitleFromSource(src: string): string {
  const withoutQuery = src.split(/[?#]/)[0] ?? "";
  const lastSegment = withoutQuery.split("/").filter(Boolean).at(-1) ?? "";
  try {
    return decodeURIComponent(lastSegment) || src;
  } catch {
    return lastSegment || src;
  }
}

const mediaSpec: NodeSpec = {
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  attrs: {
    kind: { default: "video" },
    src: { default: "" },
    title: { default: "" },
    refId: { default: "" },
  },
  toDOM: (node) => {
    const kind = isMediaKind(node.attrs.kind) ? node.attrs.kind : "video";
    const src = String(node.attrs.src ?? "");
    const title = String(node.attrs.title ?? "");
    const refId = String(node.attrs.refId ?? "");
    if (kind === "file") {
      return [
        "a",
        {
          class: "note-media note-media-file",
          "data-media-file": "true",
          "data-media-title": title,
          href: src || "#",
        },
        title || src || "Untitled file",
      ];
    }
    return [
      kind,
      {
        class: "note-media",
        controls: "true",
        "data-media-title": title,
        ...(refId ? { "data-media-ref": refId } : {}),
        ...(src ? { src } : {}),
      },
    ];
  },
  parseDOM: [
    {
      tag: "a[data-media-file]",
      priority: 60,
      getAttrs: (dom) => ({
        kind: "file",
        src: dom.getAttribute("href") ?? "",
        title: dom.getAttribute("data-media-title") ?? dom.textContent ?? "",
      }),
    },
    {
      tag: "video",
      getAttrs: (dom) => ({
        kind: "video",
        src: dom.getAttribute("src") ?? "",
        title: dom.getAttribute("data-media-title") ?? "",
        refId: dom.getAttribute("data-media-ref") ?? "",
      }),
    },
    {
      tag: "audio",
      getAttrs: (dom) => ({
        kind: "audio",
        src: dom.getAttribute("src") ?? "",
        title: dom.getAttribute("data-media-title") ?? "",
        refId: dom.getAttribute("data-media-ref") ?? "",
      }),
    },
  ],
};

const rawMarkdownSpec: NodeSpec = {
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  toDOM: () => [
    "pre",
    {
      class: "unsupported-markdown-source",
      "data-unsupported-markdown": "true",
    },
    ["code", 0],
  ],
  parseDOM: [
    {
      tag: "pre[data-unsupported-markdown]",
      preserveWhitespace: "full",
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
    taskId: { default: null },
    blockId: { default: null },
  },
  toDOM: (node) => [
    "li",
    {
      class: "check-item",
      "data-checked": node.attrs.checked ? "true" : "false",
      ...(node.attrs.taskId ? { "data-task-id": String(node.attrs.taskId) } : {}),
      ...(node.attrs.blockId ? { "data-block-id": String(node.attrs.blockId) } : {}),
    },
    [
      "span",
      {
        class: "check-item-box",
        contenteditable: "false",
        role: "checkbox",
        "aria-checked": node.attrs.checked ? "true" : "false",
        tabindex: "0",
        "aria-keyshortcuts": "Alt+Shift+Enter",
      },
    ],
    ["div", { class: "check-item-content" }, 0],
  ],
  parseDOM: [
    {
      tag: "li[data-checked]",
      priority: 60,
      getAttrs: (dom) => ({
        checked: dom.getAttribute("data-checked") === "true",
        taskId: dom.getAttribute("data-task-id"),
        blockId: dom.getAttribute("data-block-id"),
      }),
    },
  ],
};

const toggleListSpec: NodeSpec = {
  content: "toggle_item+",
  group: "block",
  toDOM: () => ["ul", { class: "toggle-list", "data-toggle-list": "true" }, 0],
  parseDOM: [{ tag: "ul[data-toggle-list]", priority: 60 }],
};

const toggleItemSpec: NodeSpec = {
  content: "(paragraph | heading) block*",
  defining: true,
  attrs: {
    open: { default: true },
  },
  toDOM: (node) => {
    const open = node.attrs.open !== false;
    return [
      "li",
      {
        class: "toggle-item",
        "data-toggle-open": open ? "true" : "false",
      },
      [
        "button",
        {
          class: "toggle-item-disclosure",
          type: "button",
          contenteditable: "false",
          "aria-expanded": open ? "true" : "false",
          "aria-label": `${open ? "Collapse" : "Expand"} collapsible item`,
          "aria-keyshortcuts": "Alt+Enter",
        },
      ],
      ["div", { class: "toggle-item-content" }, 0],
    ];
  },
  parseDOM: [
    {
      tag: "li[data-toggle-open]",
      priority: 60,
      getAttrs: (dom) => ({ open: dom.getAttribute("data-toggle-open") === "true" }),
    },
  ],
};

const LANGUAGE_CLASS = /(?:^|\s)language-(\S+)/;

const diagramSpec: NodeSpec = {
  group: "block",
  atom: true,
  isolating: true,
  draggable: true,
  selectable: true,
  attrs: {
    model: { default: createDefaultDiagram() },
  },
  toDOM: (node) => [
    "pre",
    {
      "data-skriuw-diagram": "true",
      "data-diagram-version": "1",
    },
    ["code", { class: "language-mermaid" }, serializeMermaidFlowchart(node.attrs.model)],
  ],
  parseDOM: [
    {
      tag: "pre[data-skriuw-diagram]",
      priority: 80,
      preserveWhitespace: "full",
      getAttrs: (dom) => {
        const parsed = parseMermaidFlowchart(dom.textContent ?? "");
        return parsed.ok ? { model: parsed.model } : false;
      },
    },
    {
      tag: "pre",
      priority: 70,
      preserveWhitespace: "full",
      getAttrs: (dom) => {
        const code = dom.querySelector("code");
        const language = code?.className.match(LANGUAGE_CLASS)?.[1]?.toLowerCase();
        if (language !== "mermaid" && language !== "diagram") return false;
        const parsed = parseMermaidFlowchart(code?.textContent ?? "");
        return parsed.ok ? { model: parsed.model } : false;
      },
    },
  ],
};

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

const ANNOTATION_THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isAnnotationThreadId(value: unknown): value is string {
  return typeof value === "string" && ANNOTATION_THREAD_ID_PATTERN.test(value);
}

const highlightSpec: MarkSpec = {
  attrs: {
    color: { default: "yellow" },
  },
  parseDOM: [
    {
      tag: "mark",
      getAttrs: (dom) => {
        const color = dom.getAttribute("data-skriuw-highlight");
        if (color === null && dom.getAttribute("data-skriuw-annotation") !== null) {
          return false;
        }
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

/**
 * Anchors a comment thread to a text range. The thread body lives in SQLite;
 * the document carries only this id.
 *
 * `inclusive: false` keeps typing at either edge outside the anchor, and
 * `excludes: ""` lets overlapping threads stack rather than evicting each
 * other — the default would make a mark exclude its own type.
 */
const annotationSpec: MarkSpec = {
  attrs: {
    threadId: {},
  },
  inclusive: false,
  excludes: "",
  parseDOM: [
    {
      tag: "mark[data-skriuw-annotation]",
      getAttrs: (dom) => {
        const threadId = dom.getAttribute("data-skriuw-annotation");
        return isAnnotationThreadId(threadId) ? { threadId } : false;
      },
    },
  ],
  toDOM: (mark) => [
    "mark",
    {
      "data-skriuw-annotation": mark.attrs.threadId,
      "aria-details": `skriuw-annotation-${mark.attrs.threadId}`,
    },
    0,
  ],
};

const tableSpecs = tableNodes({
  tableGroup: "block",
  cellContent: "block+",
  cellAttributes: {},
});

/**
 * The note's annotation layer hangs off the document root rather than being a
 * block of its own: it is drawn over the whole note, including the margins
 * outside any block, and must not be movable, deletable, or reorderable as
 * content. Living in `document_json` keeps it on the existing `SaveDocument`
 * operation, history outbox, archive, backup, and sync paths. See ADR-0035.
 *
 * The payload is stored opaquely and validated on read by `parseDrawingLayer`,
 * so a layer written by a newer build survives an older build untouched.
 */
const documentSpec: NodeSpec = {
  ...(basicSchema.spec.nodes.get("doc") as NodeSpec),
  attrs: { drawing: { default: null } },
};

const nodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")
  .update("doc", documentSpec)
  .update("image", blockedImageSpec)
  .update("paragraph", paragraphSpec)
  .update("heading", headingSpec)
  .update("code_block", codeBlockSpec)
  .addToEnd("raw_markdown", rawMarkdownSpec)
  .addToEnd("diagram", diagramSpec)
  .addToEnd("check_list", checkListSpec)
  .addToEnd("check_item", checkItemSpec)
  .addToEnd("toggle_list", toggleListSpec)
  .addToEnd("toggle_item", toggleItemSpec)
  .addToEnd("tag_ref", tagRefSpec)
  .addToEnd("mention_ref", mentionRefSpec)
  .addToEnd("image_ref", imageRefSpec)
  .addToEnd("media", mediaSpec)
  .addToEnd("table", tableSpecs.table)
  .addToEnd("table_row", tableSpecs.table_row)
  .addToEnd("table_cell", tableSpecs.table_cell)
  .addToEnd("table_header", tableSpecs.table_header);

export const productSchema = new Schema({
  nodes,
  marks: basicSchema.spec.marks
    .addToEnd("strikethrough", strikethroughSpec)
    .addToEnd("underline", underlineSpec)
    .addToEnd("highlight", highlightSpec)
    .addToEnd("annotation", annotationSpec),
});

export const slashMenuKey = new PluginKey<SlashMenuState>("skriuw-slash-menu");

const closedSlashMenuState: SlashMenuState = { open: false, trigger: "/", query: "" };

const SLASH_TRIGGER_PATTERN = /(?:^|[\s\0])([/:])([a-z0-9_+-]*)$/i;

function createSlashMenuPlugin(): Plugin<SlashMenuState> {
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

function diagramInputRule(): InputRule {
  return new InputRule(/^```(?:mermaid|diagram)\s$/i, (state, _match, start, end) => {
    const diagram = productSchema.nodes.diagram;
    if (!diagram || state.doc.resolve(start).parent.type.spec.code) return null;
    const inserted = diagram.create({ model: createDefaultDiagram() });
    const tr = state.tr.replaceRangeWith(
      start,
      end,
      inserted,
    );
    let position: number | null = null;
    tr.doc.descendants((candidate, pos) => {
      if (candidate !== inserted) return position === null;
      position = pos;
      return false;
    });
    if (position !== null) tr.setSelection(NodeSelection.create(tr.doc, position));
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

function taskInputRule(): InputRule {
  return new InputRule(/^\[([ xX]?)\]\s$/, (state, match, start, end) => {
    const checkList = productSchema.nodes.check_list;
    const checkItem = productSchema.nodes.check_item;
    const bulletList = productSchema.nodes.bullet_list;
    const listItem = productSchema.nodes.list_item;
    if (!checkList || !checkItem || !bulletList || !listItem) return null;
    const $start = state.doc.resolve(start);
    if ($start.parent.type.spec.code || $start.parentOffset !== 0) return null;
    let itemDepth = 0;
    for (let depth = $start.depth; depth > 0; depth -= 1) {
      if ($start.node(depth).type === listItem) {
        itemDepth = depth;
        break;
      }
    }
    if (!itemDepth) return null;
    const item = $start.node(itemDepth);
    const bulletDepth = itemDepth - 1;
    const bullets = $start.node(bulletDepth);
    if (
      item.childCount !== 1 ||
      $start.index(itemDepth) !== 0 ||
      bullets.type !== bulletList ||
      bulletDepth === 0 ||
      $start.node(bulletDepth - 1).type.name !== "doc"
    ) return null;
    const itemIndex = $start.index(bulletDepth);
    let itemOffset = 0;
    for (let index = 0; index < itemIndex; index += 1) itemOffset += bullets.child(index).nodeSize;
    const bulletPosition = $start.before(bulletDepth);
    const tr = state.tr.delete(start, end);
    const currentBullets = tr.doc.nodeAt(bulletPosition);
    if (!currentBullets || currentBullets.type !== bulletList) return null;
    const currentItem = currentBullets.child(itemIndex);
    const attrs = taskCheckItemAttrs((match[1] ?? "").toLowerCase() === "x");
    const replacement: ProseMirrorNode[] = [];
    if (itemOffset > 0) {
      replacement.push(bulletList.create(currentBullets.attrs, currentBullets.content.cut(0, itemOffset)));
    }
    replacement.push(checkList.create(null, checkItem.create(attrs, currentItem.content)));
    if (itemOffset + currentItem.nodeSize < currentBullets.content.size) {
      replacement.push(
        bulletList.create(currentBullets.attrs, currentBullets.content.cut(itemOffset + currentItem.nodeSize)),
      );
    }
    tr.replaceWith(bulletPosition, bulletPosition + currentBullets.nodeSize, replacement);
    tr.setSelection(TextSelection.near(tr.doc.resolve(bulletPosition + 2), 1));
    return tr.scrollIntoView();
  });
}

function toggleListInputRule(): InputRule {
  return new InputRule(/^\s*\[([>vV])\]\s$/, (state, match, start, end) => {
    const toggleList = productSchema.nodes.toggle_list;
    if (!toggleList) return null;
    if (state.doc.resolve(start).parent.type.spec.code) return null;
    const tr = state.tr.delete(start, end);
    const range = tr.doc.resolve(start).blockRange();
    if (!range) return null;
    const wrapping = findWrapping(range, toggleList);
    if (!wrapping) return null;
    tr.wrap(range, wrapping);
    tr.setNodeMarkup(range.start + 1, undefined, {
      open: (match[1] ?? "").toLowerCase() === "v",
    });
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
    tr.removeMark(end, end + trailing.length, link);
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

function checkboxItemAtDom(view: EditorView, target: HTMLElement): boolean {
  const $pos = view.state.doc.resolve(view.posAtDOM(target, 0));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "check_item") continue;
    view.dispatch(view.state.tr.setNodeMarkup($pos.before(depth), undefined, {
      ...node.attrs,
      checked: !node.attrs.checked,
    }));
    return true;
  }
  return false;
}

export function toggleCheckItemAtSelection(
  state: EditorState,
  dispatch?: (transaction: EditorState["tr"]) => void,
): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "check_item") continue;
    if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(depth), undefined, {
      ...node.attrs,
      checked: !node.attrs.checked,
    }));
    return true;
  }
  return false;
}

function isCheckbox(target: EventTarget | null): target is HTMLElement {
  return (
    target !== null &&
    typeof target === "object" &&
    "classList" in target &&
    (target as HTMLElement).classList.contains("check-item-box")
  );
}

function createCheckboxTogglePlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target;
          if (
            !isCheckbox(target) ||
            !view.editable
          ) {
            return false;
          }
          event.preventDefault();
          return checkboxItemAtDom(view, target);
        },
      },
      handleKeyDown(view, event) {
        if (!isCheckbox(event.target) || !view.editable || (event.key !== "Enter" && event.key !== " ")) {
          return false;
        }
        event.preventDefault();
        return checkboxItemAtDom(view, event.target);
      },
    },
  });
}

function toggleItemAtDom(view: EditorView, target: HTMLElement): boolean {
  const $pos = view.state.doc.resolve(view.posAtDOM(target, 0));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "toggle_item") continue;
    view.dispatch(toggleItemTransaction(view.state, $pos.before(depth), node));
    return true;
  }
  return false;
}

function toggleItemTransaction(
  state: EditorState,
  position: number,
  node: ProseMirrorNode,
): EditorState["tr"] {
  const closing = node.attrs.open !== false;
  const transaction = state.tr.setNodeMarkup(position, undefined, {
    open: !closing,
  });
  const summary = node.firstChild;
  if (
    closing &&
    summary &&
    state.selection.from > position &&
    state.selection.to > position + summary.nodeSize &&
    state.selection.to < position + node.nodeSize
  ) {
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(position + summary.nodeSize), -1),
    );
  }
  return transaction;
}

function isToggleDisclosure(target: EventTarget | null): target is HTMLElement {
  return (
    target !== null &&
    typeof target === "object" &&
    "classList" in target &&
    (target as HTMLElement).classList.contains("toggle-item-disclosure")
  );
}

export function toggleItemAtSelection(
  state: EditorState,
  dispatch?: (transaction: EditorState["tr"]) => void,
): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "toggle_item") continue;
    if (dispatch) {
      dispatch(toggleItemTransaction(state, $from.before(depth), node));
    }
    return true;
  }
  return false;
}

function createToggleListPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        click(view, event) {
          const target = event.target;
          if (
            !isToggleDisclosure(target) ||
            !view.editable
          ) {
            return false;
          }
          event.preventDefault();
          return toggleItemAtDom(view, target);
        },
      },
      handleKeyDown(view, event) {
        const target = event.target;
        if (
          !isToggleDisclosure(target) ||
          !view.editable ||
          (event.key !== "Enter" && event.key !== " ")
        ) {
          return false;
        }
        event.preventDefault();
        return toggleItemAtDom(view, target);
      },
    },
  });
}

function splitTaskItem(checkItem: NonNullable<typeof productSchema.nodes.check_item>) {
  const split = splitListItem(checkItem, { checked: false, taskId: null, blockId: null });
  return (state: EditorState, dispatch?: (transaction: EditorState["tr"]) => void): boolean => {
    const { $from } = state.selection;
    let source: ProseMirrorNode | null = null;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type === checkItem) {
        source = $from.node(depth);
        break;
      }
    }
    const result: { transaction: EditorState["tr"] | null } = { transaction: null };
    if (!split(state, (next) => { result.transaction = next; })) return false;
    const transaction = result.transaction;
    if (!transaction) return false;
    if (
      source?.textContent.trim() &&
      isTaskId(source.attrs.taskId) &&
      isTaskId(source.attrs.blockId) &&
      source.attrs.taskId !== source.attrs.blockId
    ) {
      const $next = transaction.selection.$from;
      for (let depth = $next.depth; depth > 0; depth -= 1) {
        if ($next.node(depth).type !== checkItem) continue;
        transaction.setNodeMarkup($next.before(depth), undefined, taskCheckItemAttrs(false));
        break;
      }
    }
    if (dispatch) dispatch(transaction);
    return true;
  };
}

/**
 * Enter inside ordinary prose adds a line break to the current paragraph rather
 * than starting a new one, so the note's Markdown gains one line per visible
 * line instead of a blank-line-separated block. Enter on the empty line that
 * follows a break trades that break for a real paragraph split, which keeps two
 * consecutive breaks — the one shape Markdown cannot round-trip cleanly — out of
 * the document. Structural blocks (lists, headings, code, tables) keep their own
 * Enter behavior and fall through to the base keymap.
 */
function breakOrSplitParagraph(
  state: EditorState,
  dispatch?: (transaction: EditorState["tr"]) => void,
): boolean {
  const hardBreak = productSchema.nodes.hard_break;
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !hardBreak) return false;
  const { $from, $to } = selection;
  if ($from.parent.type !== productSchema.nodes.paragraph || !$from.sameParent($to)) return false;
  const container = $from.node($from.depth - 1).type.name;
  if (container !== "doc" && container !== "blockquote") return false;

  const atParagraphEnd = $to.parentOffset === $to.parent.content.size;
  if (selection.empty && atParagraphEnd && $from.nodeBefore?.type === hardBreak) {
    if (dispatch) {
      const transaction = state.tr.delete($from.pos - 1, $from.pos);
      transaction.split($from.pos - 1);
      dispatch(transaction.scrollIntoView());
    }
    return true;
  }

  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
  }
  return true;
}

function exitTerminalCodeBlockOnArrowDown(
  state: EditorState,
  dispatch?: (transaction: EditorState["tr"]) => void,
): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  if (
    !$from.parent.type.spec.code ||
    $from.parentOffset !== $from.parent.content.size ||
    $from.indexAfter(-1) !== $from.node(-1).childCount
  ) {
    return false;
  }
  return exitCode(state, dispatch);
}

export function createProductPlugins(): Plugin[] {
  const blockquote = productSchema.nodes.blockquote;
  const codeBlock = productSchema.nodes.code_block;
  const heading = productSchema.nodes.heading;
  const bulletList = productSchema.nodes.bullet_list;
  const orderedList = productSchema.nodes.ordered_list;
  const listItem = productSchema.nodes.list_item;
  const checkItem = productSchema.nodes.check_item;
  const toggleItem = productSchema.nodes.toggle_item;
  const diagram = productSchema.nodes.diagram;
  if (
    !blockquote ||
    !codeBlock ||
    !heading ||
    !bulletList ||
    !orderedList ||
    !listItem ||
    !checkItem ||
    !toggleItem ||
    !diagram
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
    createAnnotationDecorationPlugin(),
    createSuggestionPlugin(),
    createCodeHighlightPlugin(),
    createCheckboxTogglePlugin(),
    createToggleListPlugin(),
    inputRules({
      rules: [
        ...smartQuotes,
        ellipsis,
        emDash,
        taskInputRule(),
        checkListInputRule(),
        toggleListInputRule(),
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
        diagramInputRule(),
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
      "Mod-a": selectBlockThenDocument(),
      "Alt-ArrowUp": moveSelectedBlock(-1),
      "Alt-ArrowDown": moveSelectedBlock(1),
      ArrowDown: exitTerminalCodeBlockOnArrowDown,
      "Alt-Enter": toggleItemAtSelection,
      "Alt-Shift-Enter": toggleCheckItemAtSelection,
      Enter: chainCommands(
        splitTaskItem(checkItem),
        splitListItem(toggleItem, { open: true }),
        splitListItem(listItem),
        breakOrSplitParagraph,
      ),
      "Shift-Enter": chainCommands(
        splitTaskItem(checkItem),
        splitListItem(toggleItem, { open: true }),
        splitListItem(listItem),
        newlineInCode,
        createParagraphNear,
        liftEmptyBlock,
        splitBlock,
      ),
      Tab: chainCommands(
        sinkListItem(checkItem),
        sinkListItem(toggleItem),
        sinkListItem(listItem),
        goToNextCell(1),
      ),
      "Shift-Tab": chainCommands(
        liftListItem(checkItem),
        liftListItem(toggleItem),
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
  return slashMenuKey.getState(state) ?? closedSlashMenuState;
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
  return rendered.replace(/\s*\\?\n\s*/g, " ").replace(/\|/g, "\\|").trim();
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
    heading(state, node, parent, index) {
      state.write(`${state.repeat("#", node.attrs.level)} ${textAlignmentMarker(node)}`);
      state.renderInline(node, false);
      if (index < parent.childCount - 1) {
        state.ensureNewLine();
      } else {
        state.closeBlock(node);
      }
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
      const paragraph = node.firstChild;
      if (!paragraph) return;
      state.renderInline(paragraph, false);
      if (isTaskId(node.attrs.taskId) && paragraph.textContent.trim()) {
        const blockId = isTaskId(node.attrs.blockId) && node.attrs.blockId !== node.attrs.taskId
          ? `:${node.attrs.blockId}`
          : "";
        state.write(` <!--skriuw-task:${node.attrs.taskId}${blockId}-->`);
      }
      state.closeBlock(paragraph);
      node.forEach((child, _offset, index) => {
        if (index > 0) state.render(child, node, index);
      });
    },
    toggle_list(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    toggle_item(state, node) {
      state.write(node.attrs.open === false ? "[>] " : "[v] ");
      const summary = node.firstChild;
      if (!summary || summary.type.name !== "heading") {
        state.renderContent(node);
        return;
      }
      state.renderInline(summary, false);
      state.write(` ${toggleHeadingMarker(Number(summary.attrs.level))}`);
      state.closeBlock(summary);
      node.forEach((child, _offset, index) => {
        if (index > 0) state.render(child, node, index);
      });
    },
    media(state, node) {
      const kind = isMediaKind(node.attrs.kind) ? node.attrs.kind : "video";
      const refId = String(node.attrs.refId ?? "");
      const src = refId ? `images/${refId}` : String(node.attrs.src ?? "");
      const title = String(node.attrs.title ?? "") || mediaTitleFromSource(src);
      state.write(
        src ? `[${state.esc(title)}](${src})${mediaMarker(kind)}` : mediaMarker(kind),
      );
      state.closeBlock(node);
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
    diagram(state, node) {
      state.write("```mermaid\n");
      state.text(serializeMermaidFlowchart(node.attrs.model), false);
      state.ensureNewLine();
      state.write("```");
      state.closeBlock(node);
    },
    raw_markdown(state, node) {
      state.write(node.textContent);
      state.closeBlock(node);
    },
    hard_break(state, node, parent, index) {
      for (let after = index + 1; after < parent.childCount; after += 1) {
        if (parent.child(after).type === node.type) continue;
        const before = index > 0 ? parent.child(index - 1) : null;
        state.write(before && before.type !== node.type ? "\n" : "\\\n");
        return;
      }
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
    annotation: {
      open: (_state, mark) => `<mark data-skriuw-annotation="${mark.attrs.threadId}">`,
      close: "</mark>",
    },
  },
);

export function serializeProductMarkdown(document: ProseMirrorNode): string {
  const body =
    document.childCount === 1 && document.firstChild?.type.name === "raw_markdown"
      ? document.firstChild.textContent
      : productMarkdownSerializer.serialize(document);
  // A payload this build cannot read still belongs to the note, so it is
  // written back out verbatim rather than dropped on export.
  const payload = readDrawingPayload(document.attrs.drawing);
  if (payload.kind === "empty" || (payload.kind === "layer" && isEmptyDrawingLayer(payload.layer))) {
    return body;
  }
  const fence = drawingFence(payload.kind === "layer" ? payload.layer : payload.payload);
  return body.length > 0 ? `${body}\n\n${fence}` : fence;
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

type RichMarkTag = "highlight" | "annotation";

function openRichMarkTags(state: any): RichMarkTag[] {
  return (state.env.skriuwOpenRichMarkTags ??= []);
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
  const closing = source.match(/^<\/mark>/i);
  if (closing) {
    if (!silent) {
      /**
       * Highlight and annotation both close with a bare `</mark>`, so the tag
       * alone cannot say which mark it ends. Track the open tags and let the
       * close pop the innermost one; an unbalanced close stays a highlight,
       * which is how the parser behaved before annotations existed.
       */
      const stack = openRichMarkTags(state);
      state.push(`skriuw_${stack.pop() ?? "highlight"}_close`, "mark", -1);
    }
    state.pos += closing[0].length;
    return true;
  }

  const annotation = source.match(
    /^<mark\s+data-skriuw-annotation=["']([A-Za-z0-9_-]+)["']\s*>/i,
  );
  if (annotation) {
    const threadId = annotation[1];
    if (!isAnnotationThreadId(threadId)) return false;
    if (!silent) {
      const token = state.push("skriuw_annotation_open", "mark", 1);
      token.meta = { threadId };
      openRichMarkTags(state).push("annotation");
    }
    state.pos += annotation[0].length;
    return true;
  }

  const highlight = source.match(/^<mark(?:\s+data-skriuw-highlight=["']([a-z]+)["'])?\s*>/i);
  if (!highlight) return false;
  const color = highlight[1]?.toLowerCase();
  if (!isHighlightColor(color)) return false;
  if (!silent) {
    const token = state.push("skriuw_highlight_open", "mark", 1);
    token.meta = { color };
    openRichMarkTags(state).push("highlight");
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

function convertDiagramFences(state: any): boolean {
  for (const token of state.tokens) {
    if (token.type !== "fence") continue;
    const language = String(token.info ?? "").trim().toLowerCase();
    if (language !== "mermaid" && language !== "diagram") continue;
    const parsed = parseMermaidFlowchart(String(token.content ?? ""));
    if (!parsed.ok) continue;
    token.type = "skriuw_diagram";
    token.meta = { ...(token.meta ?? {}), diagramModel: parsed.model };
  }
  return true;
}

if (!(defaultMarkdownParser.tokenizer.core.ruler as any).__rules?.some((r: any) => r.name === "skriuw_diagram_fences")) {
  defaultMarkdownParser.tokenizer.core.ruler.push("skriuw_diagram_fences", convertDiagramFences);
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
    softbreak: { node: "hard_break" },
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
    skriuw_annotation: {
      mark: "annotation",
      getAttrs: (tok: any) => ({ threadId: tok.meta?.threadId ?? "" }),
    },
    skriuw_diagram: {
      node: "diagram",
      getAttrs: (tok: any) => ({ model: tok.meta?.diagramModel ?? createDefaultDiagram() }),
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

function toggleHeadingMarker(level: number): string {
  return `<!--skriuw-toggle-heading:${level}-->`;
}

function mediaMarker(kind: MediaKind): string {
  return `<!--skriuw-media:${kind}-->`;
}

const TOGGLE_HEADING_MARKER = /\s*<!--skriuw-toggle-heading:([1-6])-->$/;
const MEDIA_MARKER = /^\s*<!--skriuw-media:(video|audio|file)-->$/;

const CHECKBOX_PREFIX = /^\[([ xX])\] /;
const TOGGLE_PREFIX = /^\[([>vV])\] /;
const TASK_MARKER = /(?:\s*)<!--skriuw-task:([A-Za-z0-9_-]{1,128})(?::([A-Za-z0-9_-]{1,128}))?-->$/;

function isTaskId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

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

function togglePrefix(item: JsonNode): RegExpMatchArray | null {
  if (item.type !== "list_item") return null;
  const paragraph = item.content?.[0] as JsonNode | undefined;
  if (paragraph?.type !== "paragraph") return null;
  const text = paragraph.content?.[0] as JsonNode | undefined;
  if (text?.type !== "text" || typeof text.text !== "string") return null;
  return text.text.match(TOGGLE_PREFIX);
}

function toCheckItem(item: JsonNode, prefix: RegExpMatchArray): JsonNode {
  const paragraph = item.content?.[0] as JsonNode;
  const text = paragraph.content?.[0] as JsonNode;
  const stripped = (text.text as string).slice(prefix[0].length);
  const marker = stripped.match(TASK_MARKER);
  const visibleText = marker ? stripped.slice(0, marker.index).trimEnd() : stripped;
  const inline = visibleText.length > 0
    ? [{ ...text, text: visibleText }, ...(paragraph.content?.slice(1) ?? [])]
    : paragraph.content?.slice(1) ?? [];
  let taskId = marker?.[1] ?? null;
  let blockId = marker?.[2] ?? null;
  const blocks = (item.content?.slice(1) ?? []).filter((value) => {
    const block = value as JsonNode;
    if (taskId || block.type !== "paragraph" || block.content?.length !== 1) {
      return true;
    }
    const markerText = block.content[0] as JsonNode | undefined;
    if (markerText?.type !== "text" || typeof markerText.text !== "string") {
      return true;
    }
    const blockMarker = markerText.text.match(TASK_MARKER);
    if (!blockMarker) {
      return true;
    }
    taskId = blockMarker[1] ?? null;
    blockId = blockMarker[2] ?? null;
    return false;
  });
  return {
    type: "check_item",
    attrs: {
      checked: prefix[1]?.toLowerCase() === "x",
      taskId,
      blockId: blockId !== taskId ? blockId : null,
    },
    content: [
      { ...paragraph, content: inline },
      ...blocks,
    ],
  };
}

/**
 * A toggle whose summary is a heading has no Markdown spelling of its own — a
 * `#` prefix mid-line is literal text — so the level travels as a trailing
 * marker comment on the summary line and is lifted back off here.
 */
function liftToggleHeading(inline: unknown[]): { level: number; inline: unknown[] } | null {
  const last = inline.at(-1) as JsonNode | undefined;
  if (last?.type !== "text" || typeof last.text !== "string") return null;
  const marker = last.text.match(TOGGLE_HEADING_MARKER);
  if (!marker) return null;
  const remaining = last.text.slice(0, marker.index);
  return {
    level: Number(marker[1]),
    inline: remaining.length > 0
      ? [...inline.slice(0, -1), { ...last, text: remaining }]
      : inline.slice(0, -1),
  };
}

function toToggleItem(item: JsonNode, prefix: RegExpMatchArray): JsonNode {
  const paragraph = item.content?.[0] as JsonNode;
  const text = paragraph.content?.[0] as JsonNode;
  const stripped = (text.text as string).slice(prefix[0].length);
  const inline = stripped.length > 0
    ? [{ ...text, text: stripped }, ...(paragraph.content?.slice(1) ?? [])]
    : paragraph.content?.slice(1) ?? [];
  const heading = liftToggleHeading(inline);
  const summary = heading
    ? {
        type: "heading",
        attrs: { level: heading.level, textAlign: paragraph.attrs?.textAlign ?? "left" },
        content: heading.inline,
      }
    : { ...paragraph, content: inline };
  return {
    type: "toggle_item",
    attrs: { open: prefix[1]?.toLowerCase() === "v" },
    content: [summary, ...(item.content?.slice(1) ?? [])],
  };
}

function linkHref(node: JsonNode): string | null {
  const marks = Array.isArray(node.marks) ? (node.marks as JsonNode[]) : [];
  const link = marks.find((mark) => mark.type === "link");
  const href = (link?.attrs as Record<string, unknown> | undefined)?.href;
  return typeof href === "string" ? href : null;
}

function toMediaNode(paragraph: JsonNode): JsonNode | null {
  const content = Array.isArray(paragraph.content) ? (paragraph.content as JsonNode[]) : [];
  const marker = content.at(-1);
  if (marker?.type !== "text" || typeof marker.text !== "string") return null;
  const match = marker.text.match(MEDIA_MARKER);
  if (!match) return null;
  const kind = match[1] as MediaKind;
  if (content.length === 1) {
    return { type: "media", attrs: { kind, src: "", title: "", refId: "" } };
  }
  const label = content.length === 2 ? content[0] : undefined;
  const href = label ? linkHref(label) : null;
  if (!href || label?.type !== "text" || typeof label.text !== "string") return null;
  const target = href.startsWith("images/") ? href.slice("images/".length) : "";
  const refId = /^[A-Za-z0-9_-]+$/.test(target) ? target : "";
  return {
    type: "media",
    attrs: { kind, src: refId ? "" : href, title: label.text, refId },
  };
}

/**
 * Media embeds serialize as an ordinary Markdown link plus a marker comment, so
 * other editors still render something useful. Rewrites those paragraphs back
 * into `media` nodes.
 */
function upgradeMediaParagraphs(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  const record = node as JsonNode;
  if (record.type === "paragraph") {
    const media = toMediaNode(record);
    if (media) return media;
  }
  if (!Array.isArray(record.content)) return record;
  return {
    ...record,
    content: record.content.map((child) => upgradeMediaParagraphs(child)),
  };
}

/**
 * CommonMark has no task-list syntax, so `- [ ] thing` parses as a plain
 * bullet item whose text starts with the checkbox marker. Rewrites runs of
 * such items into `check_list`/`check_item` nodes, splitting mixed bullet
 * lists into adjacent lists so plain items stay bullets.
 */
function upgradeSpecialLists(node: unknown): unknown[] {
  if (node === null || typeof node !== "object") return [node];
  const record = node as JsonNode;
  const content = Array.isArray(record.content)
    ? record.content.flatMap((child) => upgradeSpecialLists(child))
    : record.content;
  if (record.type !== "bullet_list" || !Array.isArray(content)) {
    return [content === record.content ? record : { ...record, content }];
  }
  const runs: JsonNode[] = [];
  for (const child of content as JsonNode[]) {
    const check = checkboxPrefix(child);
    const toggle = togglePrefix(child);
    const type = check ? "check_list" : toggle ? "toggle_list" : "bullet_list";
    const item = check
      ? toCheckItem(child, check)
      : toggle
        ? toToggleItem(child, toggle)
        : child;
    const last = runs[runs.length - 1];
    if (last && last.type === type) {
      (last.content as JsonNode[]).push(item);
    } else {
      runs.push(
        type === "check_list"
          ? { type, content: [item] }
          : type === "toggle_list"
            ? { type, content: [item] }
          : { ...record, content: [item] },
      );
    }
  }
  return runs;
}

export function parseProductMarkdown(markdown: string): ProseMirrorNode {
  // The annotation layer is lifted out first so it reaches the document root
  // even for sources that otherwise parse as opaque Markdown.
  const { markdown: body, layer } = extractDrawingFence(markdown);
  return withDrawingLayer(parseMarkdownBody(body), layer);
}

function withDrawingLayer(document: ProseMirrorNode, layer: unknown): ProseMirrorNode {
  if (layer === null || layer === undefined) return document;
  return productSchema.node("doc", { drawing: layer }, document.content);
}

function parseMarkdownBody(markdown: string): ProseMirrorNode {
  if (markdown.trim().length === 0) {
    return plainParagraphDocument("");
  }
  if (requiresLosslessMarkdownSource(markdown)) {
    return productSchema.node("doc", null, [
      productSchema.node(
        "raw_markdown",
        null,
        markdown.length > 0 ? productSchema.text(markdown) : undefined,
      ),
    ]);
  }
  try {
    const parsed = productMarkdownParser.parse(markdown);
    try {
      const [upgraded] = upgradeSpecialLists(parsed.toJSON());
      return productSchema.nodeFromJSON(upgradeMediaParagraphs(upgraded));
    } catch {
      return parsed;
    }
  } catch {
    return plainParagraphDocument(markdown);
  }
}

export function requiresLosslessMarkdownSource(markdown: string): boolean {
  const frontmatter =
    /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
  const footnote = /(?:^|[^\\])\[\^[^\]\r\n]+\]/m;
  return frontmatter.test(markdown) || footnote.test(markdown);
}

export function hasLosslessMarkdownDocument(documentJson: unknown): boolean {
  if (typeof documentJson !== "object" || documentJson === null) {
    return false;
  }
  const document = documentJson as { content?: unknown[] };
  return document.content?.some(
    (node) =>
      typeof node === "object" &&
      node !== null &&
      (node as { type?: unknown }).type === "raw_markdown",
  ) ?? false;
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
  previousDocumentJson?: unknown,
): ProseMirrorNode {
  const parsed = parseProductMarkdown(markdown);
  try {
    const previous = previousDocumentJson === undefined
      ? null
      : productSchema.nodeFromJSON(previousDocumentJson);
    const previousDiagrams: ProseMirrorNode[] = [];
    previous?.descendants((node) => {
      if (node.type.name === "diagram") previousDiagrams.push(node);
      return true;
    });
    let diagramIndex = 0;
    const relinked = relinkImageNode(parsed.toJSON(), knownImageIds);
    function preserveDiagramLayouts(value: unknown): unknown {
      if (value === null || typeof value !== "object") return value;
      const record = value as Record<string, unknown>;
      if (record.type === "diagram") {
        const previousDiagram = previousDiagrams[diagramIndex];
        diagramIndex += 1;
        if (!previousDiagram) return record;
        const attrs = typeof record.attrs === "object" && record.attrs !== null
          ? record.attrs as Record<string, unknown>
          : {};
        const source = serializeMermaidFlowchart(attrs.model);
        const reconciled = parseMermaidFlowchart(
          source,
          readDiagramModel(previousDiagram.attrs.model),
        );
        return reconciled.ok
          ? { ...record, attrs: { ...attrs, model: reconciled.model } }
          : record;
      }
      return Array.isArray(record.content)
        ? { ...record, content: record.content.map(preserveDiagramLayouts) }
        : record;
    }
    return productSchema.nodeFromJSON(preserveDiagramLayouts(relinked));
  } catch {
    return parsed;
  }
}

export function countWords(document: ProseMirrorNode): number {
  let words = 0;
  document.descendants((node) => {
    if (node.type.name === "diagram") {
      for (const item of readDiagramModel(node.attrs.model).nodes) {
        words += item.label.split(/\s+/).filter((word) => word.length > 0).length;
      }
      return false;
    }
    if (node.isText && node.text) {
      words += node.text.split(/\s+/).filter((word) => word.length > 0).length;
    }
    return true;
  });
  return words;
}
