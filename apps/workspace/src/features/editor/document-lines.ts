import type { Node as ProseMirrorNode } from "prosemirror-model";
import { productSchema, serializeProductMarkdown } from "./schema";

/**
 * Where a Markdown line lands in the block document. `offset` counts positions
 * from the start of the top-level block's content, so a line inside a nested
 * list item or table cell resolves to that textblock rather than the block's
 * first one.
 */
export type DocumentLineTarget = {
  blockIndex: number;
  offset: number;
};

export type DocumentLineIndex = {
  lineCount: number;
  /** One-based Markdown line each top-level block starts on. */
  blockStartLines: readonly number[];
  /**
   * Block-relative caret offset of the text each one-based line carries, or
   * null for lines with no text of their own: blank separators, fences,
   * rules, table separators.
   */
  lineOffsets: readonly (number | null)[];
};

type TextSegment = {
  offset: number;
  pieces: readonly string[];
};

type SourceLines = {
  raw: readonly string[];
  unescaped: readonly string[];
  starts: readonly number[];
};

const MARKDOWN_ESCAPE = /\\([\\`*_{}[\]()#+\-.!|>~<])/g;

function countLines(text: string): number {
  return text.split("\n").length;
}

function splitSource(markdown: string): SourceLines {
  const raw = markdown.split("\n");
  const starts: number[] = [];
  let at = 0;
  for (const line of raw) {
    starts.push(at);
    at += line.length + 1;
  }
  return { raw, unescaped: raw.map((line) => line.replace(MARKDOWN_ESCAPE, "$1")), starts };
}

function isHardBreak(node: ProseMirrorNode): boolean {
  return node.type === productSchema.nodes.hard_break;
}

/**
 * The text runs of one textblock split at hard breaks and code newlines, each
 * tagged with the block-relative offset of its first character. Inline leaves
 * such as mentions and images end a piece without ending the segment, so a
 * line is matched by the text around them rather than by their serialization.
 */
function segmentsOfTextblock(textblock: ProseMirrorNode, contentOffset: number): TextSegment[] {
  const segments: TextSegment[] = [];
  let pieces: string[] = [];
  let piece = "";
  let segmentStart = contentOffset;
  let position = contentOffset;
  function endPiece() {
    if (piece.length > 0) pieces.push(piece);
    piece = "";
  }
  function endSegment(nextStart: number) {
    endPiece();
    segments.push({ offset: segmentStart, pieces });
    pieces = [];
    segmentStart = nextStart;
  }
  textblock.forEach((child) => {
    if (child.isText) {
      const value = child.text ?? "";
      for (let at = 0; at < value.length; at += 1) {
        if (value[at] === "\n") {
          endSegment(position + at + 1);
        } else {
          piece += value[at];
        }
      }
      endPiece();
    } else if (isHardBreak(child)) {
      endSegment(position + child.nodeSize);
    } else {
      endPiece();
    }
    position += child.nodeSize;
  });
  endSegment(position);
  return segments;
}

type BlockSegments = {
  segments: TextSegment[];
  /** Index into `segments` where each table row starts, so its cells share a line. */
  rowStarts: Set<number>;
};

function collectSegments(block: ProseMirrorNode): BlockSegments {
  const segments: TextSegment[] = [];
  const rowStarts = new Set<number>();
  function walk(node: ProseMirrorNode, contentOffset: number) {
    if (node.isTextblock) {
      segments.push(...segmentsOfTextblock(node, contentOffset));
      return;
    }
    let childOffset = contentOffset;
    node.forEach((child) => {
      if (child.type === productSchema.nodes.table_row) rowStarts.add(segments.length);
      walk(child, childOffset + 1);
      childOffset += child.nodeSize;
    });
  }
  walk(block, 0);
  return { segments, rowStarts };
}

function lineCarries(source: SourceLines, line: number, pieces: readonly string[]): boolean {
  const meaningful = pieces.map((piece) => piece.trim()).filter((piece) => piece.length > 0);
  if (meaningful.length === 0) return false;
  const raw = source.raw[line] ?? "";
  const unescaped = source.unescaped[line] ?? "";
  const carriesAll = meaningful.every((piece) => raw.includes(piece) || unescaped.includes(piece));
  if (carriesAll) return true;
  const longest = meaningful.reduce(
    (best, piece) => (piece.length > best.length ? piece : best),
    "",
  );
  return raw.includes(longest) || unescaped.includes(longest);
}

function findLineCarrying(source: SourceLines, from: number, pieces: readonly string[]): number {
  for (let line = from; line < source.raw.length; line += 1) {
    if (lineCarries(source, line, pieces)) return line;
  }
  return -1;
}

/** First zero-based line at or after `from` where `text` starts a line and ends one. */
function findBlockLines(source: SourceLines, markdown: string, from: number, text: string): number {
  if (text.length === 0) return -1;
  for (let line = from; line < source.raw.length; line += 1) {
    const start = source.starts[line] ?? markdown.length;
    if (!markdown.startsWith(text, start)) continue;
    const end = start + text.length;
    if (end === markdown.length || markdown[end] === "\n") return line;
  }
  return -1;
}

/**
 * Line numbers in block mode mean lines of the note's Markdown, so the same
 * number selects the same content in either editor. Pass the Markdown the raw
 * editor shows when it still describes `document`; otherwise the document is
 * serialized, which is what the next save will store anyway.
 *
 * Each top-level block is first matched by its own serialization, which pins
 * blocks without text such as rules and fences. Every textblock inside it is
 * then matched by its text, walking the source lines forward, so a line in
 * the middle of a list, quote, or table resolves to the textblock that owns
 * it. Anything that cannot be matched inherits the running line cursor and
 * the next match re-anchors, so one odd block cannot skew everything below.
 */
export function buildDocumentLineIndex(
  document: ProseMirrorNode,
  markdown?: string,
): DocumentLineIndex {
  const sourceText = markdown ?? serializeProductMarkdown(document);
  const source = splitSource(sourceText);
  const lineCount = source.raw.length;
  const blockStartLines: number[] = [];
  const lineOffsets: (number | null)[] = Array.from({ length: lineCount }, () => null);
  let cursor = 0;

  document.forEach((block) => {
    const text = serializeProductMarkdown(productSchema.node("doc", null, [block]));
    const matched = findBlockLines(source, sourceText, cursor, text);
    const { segments, rowStarts } = collectSegments(block);
    let blockStart = matched;
    let blockEnd = matched === -1 ? -1 : matched + countLines(text) - 1;
    const searchFrom = matched === -1 ? cursor : matched;
    let lastLine = -1;
    const limit = matched === -1 ? lineCount - 1 : blockEnd;
    segments.forEach((segment, at) => {
      const sameRow = lastLine !== -1 && !rowStarts.has(at) && rowStarts.size > 0;
      const from = lastLine === -1 ? searchFrom : sameRow ? lastLine : lastLine + 1;
      const line = findLineCarrying(source, from, segment.pieces);
      if (line === -1 || line > limit) return;
      if (lineOffsets[line] === null) lineOffsets[line] = segment.offset;
      lastLine = line;
      if (blockStart === -1) blockStart = line;
    });
    if (blockStart === -1) {
      blockStart = Math.min(
        cursor + (blockStartLines.length === 0 ? 0 : 1),
        Math.max(lineCount - 1, 0),
      );
      blockEnd = blockStart + countLines(text) - 1;
    } else if (matched === -1) {
      blockEnd = Math.max(lastLine, blockStart);
    }
    blockStartLines.push(blockStart + 1);
    cursor = Math.max(cursor, blockEnd + 1);
  });

  return { lineCount, blockStartLines, lineOffsets };
}

function blockOwningLine(index: DocumentLineIndex, line: number): number {
  let blockIndex = 0;
  for (let current = 0; current < index.blockStartLines.length; current += 1) {
    if ((index.blockStartLines[current] ?? 1) > line) break;
    blockIndex = current;
  }
  return blockIndex;
}

function blockLineRange(
  index: DocumentLineIndex,
  blockIndex: number,
): { first: number; last: number } {
  const first = index.blockStartLines[blockIndex] ?? 1;
  const next = index.blockStartLines[blockIndex + 1];
  return { first, last: next === undefined ? index.lineCount : next - 1 };
}

export function documentLineTarget(
  document: ProseMirrorNode,
  index: DocumentLineIndex,
  line: number,
): DocumentLineTarget {
  if (document.childCount === 0) {
    return { blockIndex: 0, offset: 0 };
  }
  const target = Math.min(Math.max(Math.floor(line), 1), Math.max(index.lineCount, 1));
  const blockIndex = Math.min(blockOwningLine(index, target), document.childCount - 1);
  const { first } = blockLineRange(index, blockIndex);
  for (let current = target; current >= first; current -= 1) {
    const offset = index.lineOffsets[current - 1];
    if (offset !== null && offset !== undefined) return { blockIndex, offset };
  }
  return { blockIndex, offset: 0 };
}

/** The one-based Markdown line a caret sits on, for a block-relative caret offset. */
export function documentLineAt(index: DocumentLineIndex, target: DocumentLineTarget): number {
  const blockIndex = Math.min(
    Math.max(target.blockIndex, 0),
    Math.max(index.blockStartLines.length - 1, 0),
  );
  const { first, last } = blockLineRange(index, blockIndex);
  let line = first;
  for (let current = first; current <= last; current += 1) {
    const offset = index.lineOffsets[current - 1];
    if (offset === null || offset === undefined) continue;
    if (offset > target.offset) break;
    line = current;
  }
  return line;
}
