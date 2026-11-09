import { drawingFence, isEmptyDrawingLayer, readDrawingPayload } from "@/features/drawing/layer";
import { DUE_DATE_SIGNIFIER, isDueDate } from "@skriuw/renderer-core/tasks/due-dates";
import { RECURRENCE_SIGNIFIER, isRecurrence } from "@skriuw/renderer-core/tasks/recurrence";
import { isBareDomain, matchBareDomain } from "@skriuw/shared/helpers/bare-domain";
import {
  MarkdownSerializer,
  type MarkdownSerializerState,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";
import type { Mark, Node as ProseMirrorNode } from "prosemirror-model";
import { serializeMermaidFlowchart } from "../diagrams/model";
import { MATH_FENCE, mathDollarEscapes } from "../math/markdown";
import { isHighlightColor, isTextAlignment } from "./attributes";
import { DATABASE_FENCE_LANGUAGE } from "./database";
import { type MediaKind, isMediaKind, mediaTitleFromSource } from "./media";
import { productSchema } from "./product-schema";
import { isTaskId } from "./tasks";

type SerializerOutput = {
  out: string;
  closed: ProseMirrorNode | null;
};

// prosemirror-markdown leaves these fields out of its typings; the block cache
// replays a block's effect on them.
function exposesOutput(
  state: MarkdownSerializerState,
): state is MarkdownSerializerState & SerializerOutput {
  return "out" in state && "closed" in state;
}

/**
 * Renders one table cell as a single line of inline Markdown. A cell holding a
 * single paragraph keeps its inline marks; anything richer (lists, nested
 * tables, several blocks) has no GFM pipe-table equivalent and is flattened to
 * plain text rather than emitting a broken table.
 */
function serializeTableCell(cell: ProseMirrorNode): string {
  const only = cell.childCount === 1 ? cell.firstChild : null;
  const rendered =
    only && only.type.name === "paragraph"
      ? productMarkdownSerializer.serialize(productSchema.node("doc", null, [only]))
      : cell.textBetween(0, cell.content.size, " ", " ");
  return rendered
    .replace(/\s*\\?\n\s*/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
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

function defaultLinkDelimiter(
  side: "open" | "close",
  state: MarkdownSerializerState,
  mark: Mark,
  parent: ProseMirrorNode,
  index: number,
): string {
  const delimiter = defaultMarkdownSerializer.marks.link?.[side] ?? "";
  return typeof delimiter === "string" ? delimiter : delimiter(state, mark, parent, index);
}

const bareDomainLinkStates = new WeakSet<MarkdownSerializerState>();

function adjacentText(parent: ProseMirrorNode, index: number): string {
  if (index < 0 || index >= parent.childCount) return "";
  return parent.child(index).text ?? "";
}

function isBareDomainLink(mark: Mark, parent: ProseMirrorNode, index: number): boolean {
  const node = parent.child(index);
  const text = node.text ?? "";
  if (!node.isText || mark.attrs.title || mark.attrs.href !== `https://${text}`) return false;
  if (node.marks.at(-1) !== mark) return false;
  const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
  if (next && mark.isInSet(next.marks)) return false;
  const before = adjacentText(parent, index - 1).slice(-1);
  const context = before + text + adjacentText(parent, index + 1);
  return (
    isBareDomain(text) && matchBareDomain(context, before.length) === before.length + text.length
  );
}

type NodeSerializer = MarkdownSerializer["nodes"][string];

const productNodeSerializers: MarkdownSerializer["nodes"] = {
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
    state.write(
      pipeRow(
        Array.from({ length: width }, () => "---"),
        width,
      ),
    );
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
      const blockId =
        isTaskId(node.attrs.blockId) && node.attrs.blockId !== node.attrs.taskId
          ? `:${node.attrs.blockId}`
          : "";
      state.write(` <!--skriuw-task:${node.attrs.taskId}${blockId}-->`);
    }
    if (isRecurrence(node.attrs.recurrence)) {
      const separator = paragraph.childCount > 0 ? " " : "";
      state.write(`${separator}${RECURRENCE_SIGNIFIER} ${node.attrs.recurrence}`);
    }
    if (isDueDate(node.attrs.dueDate)) {
      const separator = paragraph.childCount > 0 || isRecurrence(node.attrs.recurrence) ? " " : "";
      state.write(`${separator}${DUE_DATE_SIGNIFIER} ${node.attrs.dueDate}`);
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
    state.write(src ? `[${state.esc(title)}](${src})${mediaMarker(kind)}` : mediaMarker(kind));
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
    state.write(`![${state.esc(String(node.attrs.alt))}](images/${node.attrs.id})`);
  },
  diagram(state, node) {
    state.write("```mermaid\n");
    state.text(serializeMermaidFlowchart(node.attrs.model), false);
    state.ensureNewLine();
    state.write("```");
    state.closeBlock(node);
  },
  database_view(state, node) {
    state.write(`\`\`\`${DATABASE_FENCE_LANGUAGE}\n`);
    state.text(String(node.attrs.folder), false);
    state.ensureNewLine();
    state.write("```");
    state.closeBlock(node);
  },
  math_block(state, node) {
    state.write(`${MATH_FENCE}\n`);
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write(MATH_FENCE);
    state.closeBlock(node);
  },
  math_inline(state, node) {
    const tex = String(node.attrs.tex ?? "").trim();
    if (tex) state.write(`$${tex}$`);
  },
  text(state, node, parent, index) {
    const text = node.text ?? "";
    if (bareDomainLinkStates.has(state)) {
      state.text(text, false);
      return;
    }
    const escapes = isPlainAutolinkText(node) ? [] : mathDollarEscapes(parent, index);
    if (escapes.length === 0) {
      defaultMarkdownSerializer.nodes.text?.(state, node, parent, index);
      return;
    }
    let cursor = 0;
    for (const offset of escapes) {
      state.text(text.slice(cursor, offset));
      state.write("\\$");
      cursor = offset + 1;
    }
    state.text(text.slice(cursor));
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
};

const productMarkSerializers: MarkdownSerializer["marks"] = {
  ...defaultMarkdownSerializer.marks,
  link: {
    ...defaultMarkdownSerializer.marks.link,
    open(state, mark, parent, index) {
      if (!isBareDomainLink(mark, parent, index)) {
        return defaultLinkDelimiter("open", state, mark, parent, index);
      }
      bareDomainLinkStates.add(state);
      return "";
    },
    close(state, mark, parent, index) {
      if (bareDomainLinkStates.delete(state)) return "";
      return defaultLinkDelimiter("close", state, mark, parent, index);
    },
  },
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
};

const productMarkdownSerializer = new MarkdownSerializer(
  productNodeSerializers,
  productMarkSerializers,
);

const KEEPS_CLOSED_BLOCK = Symbol("keeps closed block");

type BlockChunk = {
  text: string;
  closed: ProseMirrorNode | null | typeof KEEPS_CLOSED_BLOCK;
};

const blockChunks = new WeakMap<ProseMirrorNode, Map<string, BlockChunk>>();

/**
 * The last two characters written by each serialization in progress. Reading
 * them from `state.out` would flatten the growing output string on every
 * block.
 */
const outputTails = new WeakMap<SerializerOutput, string>();

/**
 * Top-level blocks are memoised per node and per context. ProseMirror keeps an
 * untouched block's node across transactions, so a save re-serializes only
 * the blocks that changed and replays the rest.
 *
 * Besides the node, a block's output depends only on whether it is last
 * (headings end differently), the type of the block left open before it
 * (adjacent lists of one type get an extra blank line) and the last two output
 * characters (blank-line and `!` escaping checks). A miss renders against just
 * those two characters, which keeps the output byte-identical to the uncached
 * serializer.
 */
function cachedTopLevel(render: NodeSerializer): NodeSerializer {
  return (state, node, parent, index) => {
    if (parent.type !== productSchema.topNodeType || !exposesOutput(state)) {
      render(state, node, parent, index);
      return;
    }
    const tail = outputTails.get(state) ?? "";
    const last = index === parent.childCount - 1 ? "1" : "0";
    const key = `${last}${tail.length}${tail}${state.closed?.type.name ?? ""}`;
    let chunks = blockChunks.get(node);
    let chunk = chunks?.get(key);
    if (chunk) {
      state.out += chunk.text;
      if (chunk.closed !== KEEPS_CLOSED_BLOCK) state.closed = chunk.closed;
    } else {
      const prefix = state.out;
      const closedBefore = state.closed;
      state.out = tail;
      render(state, node, parent, index);
      const rendered = state.out;
      if (!rendered.startsWith(tail)) {
        state.out = prefix.slice(0, prefix.length - tail.length) + rendered;
        outputTails.set(state, state.out.slice(-2));
        return;
      }
      chunk = {
        text: rendered.slice(tail.length),
        closed:
          closedBefore !== null && state.closed === closedBefore
            ? KEEPS_CLOSED_BLOCK
            : state.closed,
      };
      state.out = prefix + chunk.text;
      if (!chunks) {
        chunks = new Map();
        blockChunks.set(node, chunks);
      }
      chunks.set(key, chunk);
    }
    outputTails.set(state, (tail + chunk.text).slice(-2));
  };
}

const cachedMarkdownSerializer = new MarkdownSerializer(
  Object.fromEntries(
    Object.entries(productNodeSerializers).map(([name, render]) => [name, cachedTopLevel(render)]),
  ),
  productMarkSerializers,
);

function isPlainAutolinkText(node: ProseMirrorNode): boolean {
  return node.marks.some(
    (mark) =>
      mark.type.name === "link" &&
      (mark.attrs.href === node.text || mark.attrs.href === `https://${node.text}`),
  );
}

export function serializeProductMarkdown(document: ProseMirrorNode): string {
  const body =
    document.childCount === 1 && document.firstChild?.type.name === "raw_markdown"
      ? document.firstChild.textContent
      : cachedMarkdownSerializer.serialize(document);
  // A payload this build cannot read still belongs to the note, so it is
  // written back out verbatim rather than dropped on export.
  const payload = readDrawingPayload(document.attrs.drawing);
  if (
    payload.kind === "empty" ||
    (payload.kind === "layer" && isEmptyDrawingLayer(payload.layer))
  ) {
    return body;
  }
  const fence = drawingFence(payload.kind === "layer" ? payload.layer : payload.payload);
  return body.length > 0 ? `${body}\n\n${fence}` : fence;
}

function toggleHeadingMarker(level: number): string {
  return `<!--skriuw-toggle-heading:${level}-->`;
}

function mediaMarker(kind: MediaKind): string {
  return `<!--skriuw-media:${kind}-->`;
}
