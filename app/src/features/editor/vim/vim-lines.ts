import type { Node as ProseMirrorNode } from "prosemirror-model";
import { OBJECT_CHARACTER } from "./vim-text";

/**
 * A Vim line inside the block document: one hard-break or newline separated
 * segment of a textblock. Linewise operators and `$`/`0` work on these; plain
 * `j`/`k` walk the rows the view wrapped a line into (see vim-rows). `offsets`
 * maps each character index to its document position; `offsets[text.length]`
 * is the position just past the line's last character.
 */
export type VimLine = {
  blockPos: number;
  block: ProseMirrorNode;
  start: number;
  end: number;
  text: string;
  offsets: readonly number[];
  segmentIndex: number;
  segmentCount: number;
};

function isHardBreak(node: ProseMirrorNode): boolean {
  return node.type.name === "hard_break";
}

function segmentsOf(block: ProseMirrorNode, blockPos: number): VimLine[] {
  const lines: VimLine[] = [];
  let text = "";
  let offsets: number[] = [];
  let start = blockPos + 1;
  let position = blockPos + 1;
  const flush = (end: number, nextStart: number) => {
    offsets.push(end);
    lines.push({
      blockPos,
      block,
      start,
      end,
      text,
      offsets,
      segmentIndex: lines.length,
      segmentCount: 0,
    });
    text = "";
    offsets = [];
    start = nextStart;
  };
  block.forEach((child) => {
    if (child.isText) {
      const value = child.text ?? "";
      for (let index = 0; index < value.length; index += 1) {
        if (value[index] === "\n") {
          flush(position + index, position + index + 1);
        } else {
          text += value[index];
          offsets.push(position + index);
        }
      }
    } else if (isHardBreak(child)) {
      flush(position, position + child.nodeSize);
    } else {
      text += OBJECT_CHARACTER;
      offsets.push(position);
    }
    position += child.nodeSize;
  });
  flush(position, position);
  for (const line of lines) line.segmentCount = lines.length;
  return lines;
}

export function linesOfBlock(block: ProseMirrorNode, blockPos: number): VimLine[] {
  return segmentsOf(block, blockPos);
}

/** The line containing `pos`, or null when the position is not inside a textblock. */
export function lineAt(doc: ProseMirrorNode, pos: number): VimLine | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  const block = $pos.parent;
  if (!block.isTextblock) return null;
  const blockPos = $pos.before($pos.depth);
  const lines = segmentsOf(block, blockPos);
  for (const line of lines) {
    if (pos >= line.start && pos <= line.end) return line;
  }
  return lines[lines.length - 1] ?? null;
}

/** Character index of a document position on its line. */
export function lineOffset(line: VimLine, pos: number): number {
  for (let index = 0; index < line.offsets.length; index += 1) {
    if (line.offsets[index]! >= pos) return Math.min(index, line.text.length);
  }
  return line.text.length;
}

/** Document position of a character index, clamped to the line. */
export function positionAt(line: VimLine, index: number): number {
  const clamped = Math.max(0, Math.min(index, line.text.length));
  return line.offsets[clamped] ?? line.end;
}

/** Whether `index` is a real character position on the line (not past its end). */
export function hasCharacterAt(line: VimLine, index: number): boolean {
  return index >= 0 && index < line.text.length;
}

/** Last valid normal-mode cursor index on the line: the last character, or 0 when empty. */
export function lastCursorIndex(line: VimLine): number {
  return Math.max(0, line.text.length - 1);
}

type Found = { node: ProseMirrorNode; pos: number };

function nextTextblock(doc: ProseMirrorNode, afterPos: number): Found | null {
  let found: Found | null = null;
  doc.nodesBetween(afterPos, doc.content.size, (node, pos) => {
    if (found) return false;
    if (node.isTextblock) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

function previousTextblock(doc: ProseMirrorNode, beforePos: number): Found | null {
  let found: Found | null = null;
  doc.nodesBetween(0, beforePos, (node, pos) => {
    if (node.isTextblock) {
      if (pos < beforePos) found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

export function lineBelow(doc: ProseMirrorNode, line: VimLine): VimLine | null {
  if (line.segmentIndex + 1 < line.segmentCount) {
    return segmentsOf(line.block, line.blockPos)[line.segmentIndex + 1] ?? null;
  }
  const next = nextTextblock(doc, line.blockPos + line.block.nodeSize);
  return next ? (segmentsOf(next.node, next.pos)[0] ?? null) : null;
}

export function lineAbove(doc: ProseMirrorNode, line: VimLine): VimLine | null {
  if (line.segmentIndex > 0) {
    return segmentsOf(line.block, line.blockPos)[line.segmentIndex - 1] ?? null;
  }
  const previous = previousTextblock(doc, line.blockPos);
  if (!previous) return null;
  const lines = segmentsOf(previous.node, previous.pos);
  return lines[lines.length - 1] ?? null;
}

export function firstLine(doc: ProseMirrorNode): VimLine | null {
  const first = nextTextblock(doc, 0);
  return first ? (segmentsOf(first.node, first.pos)[0] ?? null) : null;
}

export function lastLine(doc: ProseMirrorNode): VimLine | null {
  const last = previousTextblock(doc, doc.content.size);
  if (!last) return null;
  const lines = segmentsOf(last.node, last.pos);
  return lines[lines.length - 1] ?? null;
}

/** Steps `count` lines from `line`, stopping at the document edge. */
export function lineStep(
  doc: ProseMirrorNode,
  line: VimLine,
  direction: 1 | -1,
  count: number,
): { line: VimLine; moved: number } {
  let current = line;
  let moved = 0;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    const next = direction === 1 ? lineBelow(doc, current) : lineAbove(doc, current);
    if (!next) break;
    current = next;
    moved += 1;
  }
  return { line: current, moved };
}

/** Every line of the document in order, for whole-document commands such as `:%s`. */
export function allLines(doc: ProseMirrorNode): VimLine[] {
  const lines: VimLine[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      lines.push(...segmentsOf(node, pos));
      return false;
    }
    return true;
  });
  return lines;
}

export function sameLine(a: VimLine, b: VimLine): boolean {
  return a.blockPos === b.blockPos && a.segmentIndex === b.segmentIndex;
}

/** Whether every character between two indices maps to adjacent positions, i.e. plain text. */
export function contiguousText(line: VimLine, from: number, to: number): boolean {
  for (let index = from; index < to; index += 1) {
    if (line.text[index] === OBJECT_CHARACTER) return false;
    if (line.offsets[index + 1] !== line.offsets[index]! + 1) return false;
  }
  return true;
}
