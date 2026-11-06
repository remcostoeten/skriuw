import { extractDrawingFence } from "@/features/drawing/layer";
import { isDueDate } from "@skriuw/renderer-core/tasks/due-dates";
import { normalizeRecurrence } from "@skriuw/renderer-core/tasks/recurrence";
import { findBareDomain } from "@skriuw/shared/helpers/bare-domain";
import { MarkdownParser, defaultMarkdownParser } from "prosemirror-markdown";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  createDefaultDiagram,
  parseMermaidFlowchart,
  readDiagramModel,
  serializeMermaidFlowchart,
} from "../diagrams/model";
import { inlineMathRule, mathBlockRule } from "../math/markdown";
import { isHighlightColor } from "./attributes";
import { DATABASE_FENCE_LANGUAGE, databaseFolderFromSource } from "./database";
import { normalizeAutolink } from "./links";
import { isAnnotationThreadId } from "./marks";
import type { MediaKind } from "./media";
import { productSchema } from "./product-schema";

type MarkdownTokenizer = typeof defaultMarkdownParser.tokenizer;
type InlineRuleState = Parameters<Parameters<MarkdownTokenizer["inline"]["ruler"]["before"]>[2]>[0];
type CoreRuleState = Parameters<Parameters<MarkdownTokenizer["core"]["ruler"]["push"]>[1]>[0];
type MarkdownToken = CoreRuleState["tokens"][number];
type MarkdownRuler =
  | MarkdownTokenizer["inline"]["ruler"]
  | MarkdownTokenizer["block"]["ruler"]
  | MarkdownTokenizer["core"]["ruler"];

function hasMarkdownRule(ruler: MarkdownRuler, name: string): boolean {
  if (!("__rules" in ruler) || !Array.isArray(ruler.__rules)) return false;
  return ruler.__rules.some(
    (rule: unknown) =>
      typeof rule === "object" && rule !== null && "name" in rule && rule.name === name,
  );
}

function inlineWikiLinkRule(state: InlineRuleState, silent: boolean): boolean {
  const max = state.posMax;
  const start = state.pos;

  if (
    state.src.charCodeAt(start) !== 0x5b /* [ */ ||
    state.src.charCodeAt(start + 1) !== 0x5b /* [ */
  ) {
    return false;
  }

  const contentStart = start + 2;
  const matchEnd = state.src.indexOf("]]", contentStart);
  if (matchEnd === -1 || matchEnd >= max) {
    return false;
  }

  const nextChar = state.src.charCodeAt(matchEnd + 2);
  if (nextChar === 0x28 /* ( */ || nextChar === 0x5b /* [ */) {
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

if (!hasMarkdownRule(defaultMarkdownParser.tokenizer.inline.ruler, "wiki_link")) {
  defaultMarkdownParser.tokenizer.inline.ruler.before("link", "wiki_link", inlineWikiLinkRule);
}

type RichMarkTag = "highlight" | "annotation";

function openRichMarkTags(state: InlineRuleState): RichMarkTag[] {
  return (state.env.skriuwOpenRichMarkTags ??= []);
}

function richFormattingTagRule(state: InlineRuleState, silent: boolean): boolean {
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

  const annotation = source.match(/^<mark\s+data-skriuw-annotation=["']([A-Za-z0-9_-]+)["']\s*>/i);
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

if (!hasMarkdownRule(defaultMarkdownParser.tokenizer.inline.ruler, "math_inline")) {
  defaultMarkdownParser.tokenizer.inline.ruler.before("escape", "math_inline", inlineMathRule);
}

if (!hasMarkdownRule(defaultMarkdownParser.tokenizer.block.ruler, "math_block")) {
  defaultMarkdownParser.tokenizer.block.ruler.before("fence", "math_block", mathBlockRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
}

if (!hasMarkdownRule(defaultMarkdownParser.tokenizer.inline.ruler, "skriuw_rich_formatting")) {
  defaultMarkdownParser.tokenizer.inline.ruler.before(
    "text",
    "skriuw_rich_formatting",
    richFormattingTagRule,
  );
}

/**
 * The parser is built on markdown-it's commonmark preset, which disables both
 * of these core rules outright — setting the `linkify` option alone silently
 * does nothing without enabling the rule as well.
 *
 * Fuzzy linkification stays off deliberately: it turns any bare `word.word`
 * into a link, which fires on ordinary prose (filenames, abbreviations) far
 * more often than on real URLs. Bare domains link through
 * `linkifyBareDomains` instead, which only accepts known top-level domains.
 */
/**
 * markdown-it emits a bare `inline` token inside `th`/`td`, but `table_cell`
 * holds `block+`, so the text would have nowhere to land and the cell would be
 * dropped by `createAndFill`. Wrapping the inline run in paragraph tokens keeps
 * the cell content valid without a bespoke token handler.
 */
function wrapTableCellContent(state: CoreRuleState): boolean {
  const tokens = state.tokens;
  const wrapped: MarkdownToken[] = [];
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

if (!hasMarkdownRule(defaultMarkdownParser.tokenizer.core.ruler, "table_cell_paragraphs")) {
  defaultMarkdownParser.tokenizer.core.ruler.push("table_cell_paragraphs", wrapTableCellContent);
}

function applyTextAlignmentMarkers(state: CoreRuleState): boolean {
  const tokens = state.tokens;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const opening = tokens[index];
    const inline = tokens[index + 1];
    if (!opening || !inline) continue;
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
    opening.meta = { ...opening.meta, textAlign: match[1] };
  }
  return true;
}

if (!hasMarkdownRule(defaultMarkdownParser.tokenizer.core.ruler, "skriuw_text_alignment")) {
  defaultMarkdownParser.tokenizer.core.ruler.push(
    "skriuw_text_alignment",
    applyTextAlignmentMarkers,
  );
}

function convertDiagramFences(state: CoreRuleState): boolean {
  for (const token of state.tokens) {
    if (token.type !== "fence") continue;
    const language = String(token.info ?? "")
      .trim()
      .toLowerCase();
    if (language !== "mermaid" && language !== "diagram") continue;
    const parsed = parseMermaidFlowchart(String(token.content ?? ""));
    if (!parsed.ok) continue;
    token.type = "skriuw_diagram";
    token.meta = { ...token.meta, diagramModel: parsed.model };
  }
  return true;
}

if (!hasMarkdownRule(defaultMarkdownParser.tokenizer.core.ruler, "skriuw_diagram_fences")) {
  defaultMarkdownParser.tokenizer.core.ruler.push("skriuw_diagram_fences", convertDiagramFences);
}

function convertDatabaseFences(state: CoreRuleState): boolean {
  for (const token of state.tokens) {
    if (token.type !== "fence") continue;
    const language = String(token.info ?? "")
      .trim()
      .toLowerCase();
    if (language !== DATABASE_FENCE_LANGUAGE) continue;
    token.type = "skriuw_database";
    token.meta = {
      ...token.meta,
      databaseFolder: databaseFolderFromSource(String(token.content ?? "")),
    };
  }
  return true;
}

if (!hasMarkdownRule(defaultMarkdownParser.tokenizer.core.ruler, "skriuw_database_fences")) {
  defaultMarkdownParser.tokenizer.core.ruler.push("skriuw_database_fences", convertDatabaseFences);
}

function bareDomainTokens(state: CoreRuleState, text: string, before: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = [];
  let cursor = 0;
  const context = before + text;
  for (
    let found = findBareDomain(context, before.length);
    found;
    found = findBareDomain(context, found.end)
  ) {
    const start = found.start - before.length;
    const domain = context.slice(found.start, found.end);
    if (start > cursor) tokens.push(textToken(state, text.slice(cursor, start)));
    const open = new state.Token("link_open", "a", 1);
    open.attrs = [["href", normalizeAutolink(domain)]];
    open.markup = "linkify";
    open.info = "auto";
    tokens.push(open, textToken(state, domain), new state.Token("link_close", "a", -1));
    cursor = found.end - before.length;
  }
  if (tokens.length > 0 && cursor < text.length) tokens.push(textToken(state, text.slice(cursor)));
  return tokens;
}

function textToken(state: CoreRuleState, content: string): MarkdownToken {
  const token = new state.Token("text", "", 0);
  token.content = content;
  return token;
}

function linkifyBareDomains(state: CoreRuleState): boolean {
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children) continue;
    const children: MarkdownToken[] = [];
    let linkDepth = 0;
    let previous: MarkdownToken | null = null;
    for (const token of block.children) {
      if (token.type === "link_open") linkDepth += 1;
      if (token.type === "link_close") linkDepth -= 1;
      if (token.type === "html_inline" && /^<a[\s>]/i.test(token.content)) linkDepth += 1;
      if (token.type === "html_inline" && /^<\/a\s*>/i.test(token.content)) linkDepth -= 1;
      const before = previous?.type === "text" ? previous.content.slice(-1) : "";
      const linked =
        token.type === "text" && linkDepth === 0
          ? bareDomainTokens(state, token.content, before)
          : [];
      children.push(...(linked.length > 0 ? linked : [token]));
      previous = token;
    }
    block.children = children;
  }
  return true;
}

if (!hasMarkdownRule(defaultMarkdownParser.tokenizer.core.ruler, "skriuw_bare_domains")) {
  defaultMarkdownParser.tokenizer.core.ruler.push("skriuw_bare_domains", linkifyBareDomains);
}

defaultMarkdownParser.tokenizer.enable(["strikethrough", "linkify", "table"], true);
defaultMarkdownParser.tokenizer.set({ linkify: true });
defaultMarkdownParser.tokenizer.linkify.set({
  fuzzyLink: false,
  fuzzyEmail: false,
  fuzzyIP: false,
});

const productMarkdownParser = new MarkdownParser(productSchema, defaultMarkdownParser.tokenizer, {
  ...defaultMarkdownParser.tokens,
  softbreak: { node: "hard_break" },
  s: { mark: "strikethrough" },
  paragraph: {
    block: "paragraph",
    getAttrs: (tok) => ({ textAlign: tok.meta?.textAlign ?? "left" }),
  },
  heading: {
    block: "heading",
    getAttrs: (tok) => ({
      level: +tok.tag.slice(1),
      textAlign: tok.meta?.textAlign ?? "left",
    }),
  },
  skriuw_underline: { mark: "underline" },
  skriuw_highlight: {
    mark: "highlight",
    getAttrs: (tok) => ({ color: tok.meta?.color ?? "yellow" }),
  },
  skriuw_annotation: {
    mark: "annotation",
    getAttrs: (tok) => ({ threadId: tok.meta?.threadId ?? "" }),
  },
  skriuw_diagram: {
    node: "diagram",
    getAttrs: (tok) => ({ model: tok.meta?.diagramModel ?? createDefaultDiagram() }),
  },
  skriuw_database: {
    node: "database_view",
    getAttrs: (tok) => ({ folder: tok.meta?.databaseFolder ?? "" }),
  },
  math_block: { block: "math_block", noCloseToken: true },
  math_inline: {
    node: "math_inline",
    getAttrs: (tok) => ({ tex: tok.content }),
  },
  table: { block: "table" },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: "table_row" },
  th: { block: "table_header" },
  td: { block: "table_cell" },
  wiki_link: {
    node: "mention_ref",
    getAttrs: (tok) => ({
      kind: "note",
      id: tok.content,
      label: tok.content,
    }),
  },
});

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

const TOGGLE_HEADING_MARKER = /\s*<!--skriuw-toggle-heading:([1-6])-->$/;
const MEDIA_MARKER = /^\s*<!--skriuw-media:(video|audio|file)-->$/;

const CHECKBOX_PREFIX = /^\[([ xX])\] /;
const TOGGLE_PREFIX = /^\[([>vV])\] /;
const TASK_MARKER = /(?:\s*)<!--skriuw-task:([A-Za-z0-9_-]{1,128})(?::([A-Za-z0-9_-]{1,128}))?-->$/;
// A trailing Obsidian Tasks due date: the calendar emoji and a YYYY-MM-DD day.
const DUE_TOKEN = /\s*\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})$/u;

const RECURRENCE_TOKEN = /\s*\u{1F501}\s*(every\s[^\u{1F4C5}<]+?)\s*$/iu;

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

type CheckItemTokens = {
  inline: unknown[];
  taskId: string | null;
  blockId: string | null;
  dueDate: string | null;
  recurrence: string | null;
};

/**
 * The task marker, the recurrence token and the due-date token all trail the item's first line, in
 * either order: Skriuw writes the date last so Obsidian Tasks reads it, while a
 * line-level rewrite (the mobile task surface) appends the marker after it.
 */
function liftCheckItemTokens(inline: unknown[]): CheckItemTokens {
  const lifted: CheckItemTokens = {
    inline,
    taskId: null,
    blockId: null,
    dueDate: null,
    recurrence: null,
  };
  for (let pass = 0; pass < 3; pass += 1) {
    const last = lifted.inline.at(-1) as JsonNode | undefined;
    if (last?.type !== "text" || typeof last.text !== "string") break;
    const due = lifted.dueDate === null ? last.text.match(DUE_TOKEN) : null;
    const repeat = lifted.recurrence === null ? last.text.match(RECURRENCE_TOKEN) : null;
    const recurrence = repeat ? normalizeRecurrence(repeat[1] ?? "") : null;
    const marker = lifted.taskId === null ? last.text.match(TASK_MARKER) : null;
    let cut: number;
    if (due && isDueDate(due[1])) {
      lifted.dueDate = due[1];
      cut = due.index ?? last.text.length;
    } else if (repeat && recurrence !== null) {
      lifted.recurrence = recurrence;
      cut = repeat.index ?? last.text.length;
    } else if (marker) {
      lifted.taskId = marker[1] ?? null;
      lifted.blockId = marker[2] ?? null;
      cut = marker.index ?? last.text.length;
    } else {
      break;
    }
    const remaining = last.text.slice(0, cut).trimEnd();
    lifted.inline =
      remaining.length > 0
        ? [...lifted.inline.slice(0, -1), { ...last, text: remaining }]
        : lifted.inline.slice(0, -1);
  }
  return lifted;
}

function toCheckItem(item: JsonNode, prefix: RegExpMatchArray): JsonNode {
  const paragraph = item.content?.[0] as JsonNode;
  const text = paragraph.content?.[0] as JsonNode;
  const stripped = (text.text as string).slice(prefix[0].length);
  const lifted = liftCheckItemTokens([
    ...(stripped.length > 0 ? [{ ...text, text: stripped }] : []),
    ...(paragraph.content?.slice(1) ?? []),
  ]);
  const inline = lifted.inline;
  let taskId = lifted.taskId;
  let blockId = lifted.blockId;
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
      dueDate: lifted.dueDate,
      recurrence: lifted.recurrence,
    },
    content: [{ ...paragraph, content: inline }, ...blocks],
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
    inline:
      remaining.length > 0
        ? [...inline.slice(0, -1), { ...last, text: remaining }]
        : inline.slice(0, -1),
  };
}

function toToggleItem(item: JsonNode, prefix: RegExpMatchArray): JsonNode {
  const paragraph = item.content?.[0] as JsonNode;
  const text = paragraph.content?.[0] as JsonNode;
  const stripped = (text.text as string).slice(prefix[0].length);
  const inline =
    stripped.length > 0
      ? [{ ...text, text: stripped }, ...(paragraph.content?.slice(1) ?? [])]
      : (paragraph.content?.slice(1) ?? []);
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
function isImageRow(content: readonly unknown[]): boolean {
  let images = 0;
  for (const child of content) {
    const node = child as JsonNode;
    if (node.type === "image" || node.type === "image_ref") {
      images += 1;
    } else if (
      node.type !== "hard_break" &&
      !(node.type === "text" && typeof node.text === "string" && node.text.trim() === "")
    ) {
      return false;
    }
  }
  return images > 1;
}

/**
 * Soft line breaks parse to `hard_break`, but GitHub renders a break between
 * images as a space, so a README badge column reads as one wrapping row. A
 * paragraph holding only images and breaks keeps that row here.
 */
function joinImageRows(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  const record = node as JsonNode;
  if (!Array.isArray(record.content)) return record;
  const content = record.content.map((child) => joinImageRows(child));
  if (record.type !== "paragraph" || !isImageRow(content)) {
    return { ...record, content };
  }
  return {
    ...record,
    content: content.map((child) =>
      (child as JsonNode).type === "hard_break" ? { type: "text", text: " " } : child,
    ),
  };
}

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
    const item = check ? toCheckItem(child, check) : toggle ? toToggleItem(child, toggle) : child;
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
      return productSchema.nodeFromJSON(upgradeMediaParagraphs(joinImageRows(upgraded)));
    } catch {
      return parsed;
    }
  } catch {
    return plainParagraphDocument(markdown);
  }
}

export function requiresLosslessMarkdownSource(markdown: string): boolean {
  const frontmatter = /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
  const footnote = /(?:^|[^\\])\[\^[^\]\r\n]+\]/m;
  return frontmatter.test(markdown) || footnote.test(markdown);
}

export function hasLosslessMarkdownDocument(documentJson: unknown): boolean {
  if (typeof documentJson !== "object" || documentJson === null) {
    return false;
  }
  const document = documentJson as { content?: unknown[] };
  return (
    document.content?.some(
      (node) =>
        typeof node === "object" &&
        node !== null &&
        (node as { type?: unknown }).type === "raw_markdown",
    ) ?? false
  );
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
    const previous =
      previousDocumentJson === undefined ? null : productSchema.nodeFromJSON(previousDocumentJson);
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
        const attrs =
          typeof record.attrs === "object" && record.attrs !== null
            ? (record.attrs as Record<string, unknown>)
            : {};
        const source = serializeMermaidFlowchart(attrs.model);
        const reconciled = parseMermaidFlowchart(
          source,
          readDiagramModel(previousDiagram.attrs.model),
        );
        return reconciled.ok ? { ...record, attrs: { ...attrs, model: reconciled.model } } : record;
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
