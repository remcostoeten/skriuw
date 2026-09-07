import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { TextSelection, type Transaction } from "prosemirror-state";
import { productSchema } from "../schema";
import {
  hasCharacterAt,
  lineAt,
  lineBelow,
  lineOffset,
  positionAt,
  type VimLine,
} from "./vim-lines";
import { writeRegister, type ClipboardBridge, type RegisterContent } from "./vim-registers";
import { firstNonBlank, swapCase } from "./vim-text";

/**
 * Operators over ProseMirror transactions. Charwise ranges are plain position
 * spans; linewise ranges are expressed through their first and last Vim line
 * so whole blocks can be removed as nodes while hard-break segments are cut
 * as text. Every function returns where the cursor belongs afterwards.
 */
export type OperatorRange = { from: number; to: number; linewise: boolean };

export type CaseChange = "toggle" | "lower" | "upper";

function leafText(leaf: ProseMirrorNode): string {
  if (leaf.type.name === "hard_break") return "\n";
  const label = leaf.attrs.label ?? leaf.attrs.alt ?? leaf.attrs.title;
  return typeof label === "string" ? label : "";
}

export function collectLines(doc: ProseMirrorNode, from: number, to: number): VimLine[] {
  const first = lineAt(doc, Math.min(from, to));
  const last = lineAt(doc, Math.max(from, to));
  if (!first || !last) return [];
  const lines: VimLine[] = [first];
  let current: VimLine | null = first;
  while (current && !(current.blockPos === last.blockPos && current.segmentIndex === last.segmentIndex)) {
    current = lineBelow(doc, current);
    if (current) lines.push(current);
  }
  return lines;
}

function wholeBlocksCovered(lines: readonly VimLine[]): boolean {
  const first = lines[0];
  const last = lines[lines.length - 1];
  return (
    first !== undefined &&
    last !== undefined &&
    first.segmentIndex === 0 &&
    last.segmentIndex === last.segmentCount - 1
  );
}

function blockNodes(lines: readonly VimLine[]): ProseMirrorNode[] {
  return lines.filter((line) => line.segmentIndex === 0).map((line) => line.block);
}

export function registerFromRange(doc: ProseMirrorNode, range: OperatorRange): RegisterContent {
  if (!range.linewise) {
    return {
      text: doc.textBetween(range.from, range.to, "\n", leafText),
      linewise: false,
      slice: doc.slice(range.from, range.to),
      blocks: null,
    };
  }
  const lines = collectLines(doc, range.from, range.to);
  return {
    text: lines.map((line) => line.text.replace(/￼/gu, "")).join("\n"),
    linewise: true,
    slice: null,
    blocks: wholeBlocksCovered(lines) ? blockNodes(lines) : null,
  };
}

export function yankRange(
  doc: ProseMirrorNode,
  range: OperatorRange,
  register: string | null,
  options: { yank: boolean; clipboard?: ClipboardBridge },
): void {
  writeRegister(register, registerFromRange(doc, range), options);
}

function cursorOnLine(doc: ProseMirrorNode, pos: number, column: "first-non-blank" | number): number {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const near = TextSelection.near(doc.resolve(clamped)).from;
  const line = lineAt(doc, near);
  if (!line) return near;
  const index = column === "first-non-blank" ? firstNonBlank(line.text) : column;
  return positionAt(line, Math.min(index, Math.max(0, line.text.length - 1)));
}

/** Deletes the range; returns the cursor position for normal mode. */
export function deleteRange(tr: Transaction, range: OperatorRange): number {
  const doc = tr.doc;
  if (!range.linewise) {
    tr.delete(range.from, range.to);
    return cursorOnLine(tr.doc, range.from, lineColumnAt(doc, range.from));
  }
  const lines = collectLines(doc, range.from, range.to);
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (!first || !last) return range.from;
  if (wholeBlocksCovered(lines)) {
    const from = soleChildStart(doc, first.start);
    const to = soleChildEnd(doc, last.start);
    tr.deleteRange(from, to);
    return cursorOnLine(tr.doc, from, "first-non-blank");
  }
  let from = first.start;
  let to = last.end;
  if (last.segmentIndex + 1 < last.segmentCount) to += 1;
  else if (first.segmentIndex > 0) from -= 1;
  tr.delete(from, to);
  return cursorOnLine(tr.doc, from, "first-non-blank");
}

/**
 * A line whose block is the only child of its wrapper (a bullet holding just
 * one paragraph) takes the wrapper with it, so `dd` never leaves an empty
 * bullet or cell behind. Wrappers with more content keep their other lines.
 */
function soleChildStart(doc: ProseMirrorNode, inside: number): number {
  const $pos = doc.resolve(inside);
  let depth = $pos.depth;
  while (depth > 1 && $pos.node(depth - 1).childCount === 1) depth -= 1;
  return $pos.before(depth);
}

function soleChildEnd(doc: ProseMirrorNode, inside: number): number {
  const $pos = doc.resolve(inside);
  let depth = $pos.depth;
  while (depth > 1 && $pos.node(depth - 1).childCount === 1) depth -= 1;
  return $pos.after(depth);
}

function lineColumnAt(doc: ProseMirrorNode, pos: number): number {
  const line = lineAt(doc, pos);
  return line ? lineOffset(line, pos) : 0;
}

/** `cc` and friends: empties the lines but keeps the first block for typing. */
export function clearLinesForChange(tr: Transaction, range: OperatorRange): number {
  const lines = collectLines(tr.doc, range.from, range.to);
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (!first || !last) return range.from;
  tr.delete(first.start, last.end);
  return first.start;
}

function textNodeSpans(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): { from: number; to: number; text: string }[] {
  const spans: { from: number; to: number; text: string }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return true;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.nodeSize);
    if (end > start) {
      spans.push({ from: start, to: end, text: node.text.slice(start - pos, end - pos) });
    }
    return false;
  });
  return spans;
}

function rangeSpan(range: OperatorRange, doc: ProseMirrorNode): { from: number; to: number } {
  if (!range.linewise) return { from: range.from, to: range.to };
  const lines = collectLines(doc, range.from, range.to);
  const first = lines[0];
  const last = lines[lines.length - 1];
  return first && last ? { from: first.start, to: last.end } : { from: range.from, to: range.to };
}

export function changeCase(tr: Transaction, range: OperatorRange, change: CaseChange): number {
  const span = rangeSpan(range, tr.doc);
  const spans = textNodeSpans(tr.doc, span.from, span.to);
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const entry = spans[index]!;
    const replaced =
      change === "toggle"
        ? swapCase(entry.text)
        : change === "lower"
          ? entry.text.toLowerCase()
          : entry.text.toUpperCase();
    if (replaced !== entry.text) tr.insertText(replaced, entry.from, entry.to);
  }
  return span.from;
}

/** `r` over a span: every text character becomes `character`; inline nodes stay. */
export function replaceCharacters(tr: Transaction, range: OperatorRange, character: string): number {
  const span = rangeSpan(range, tr.doc);
  const spans = textNodeSpans(tr.doc, span.from, span.to);
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const entry = spans[index]!;
    tr.insertText(character.repeat(Array.from(entry.text).length), entry.from, entry.to);
  }
  return Math.max(span.from, span.to - 1);
}

function paragraphsFromText(text: string): ProseMirrorNode[] {
  const paragraph = productSchema.nodes.paragraph;
  if (!paragraph) throw new Error("product schema is missing the paragraph node");
  return text.split("\n").map((line) =>
    paragraph.create(null, line.length > 0 ? productSchema.text(line) : undefined),
  );
}

function repeatFragment(nodes: readonly ProseMirrorNode[], count: number): Fragment {
  const repeated: ProseMirrorNode[] = [];
  for (let index = 0; index < count; index += 1) repeated.push(...nodes);
  return Fragment.from(repeated);
}

/** `p` / `P`: puts a register at the cursor; returns the cursor position afterwards. */
export function putRegister(
  tr: Transaction,
  cursor: number,
  content: RegisterContent,
  after: boolean,
  count: number,
): number {
  const doc = tr.doc;
  const line = lineAt(doc, cursor);
  if (!line) return cursor;
  if (content.linewise) {
    if (line.block.type.spec.code) {
      const text = Array.from({ length: count }, () => content.text).join("\n");
      const pos = after ? line.end : line.start;
      tr.insertText(after ? `\n${text}` : `${text}\n`, pos);
      return pos + (after ? 1 : 0);
    }
    const nodes = content.blocks ?? paragraphsFromText(content.text);
    const $line = doc.resolve(line.start);
    const pos = after ? $line.after($line.depth) : $line.before($line.depth);
    tr.insert(pos, repeatFragment(nodes, count));
    return cursorOnLine(tr.doc, pos + 1, "first-non-blank");
  }
  const column = lineOffset(line, cursor);
  const pos = after && hasCharacterAt(line, column) ? positionAt(line, column + 1) : cursor;
  const sizeBefore = doc.content.size;
  for (let index = 0; index < count; index += 1) {
    if (content.slice) tr.replace(pos, pos, content.slice);
    else tr.insertText(content.text, pos);
  }
  const inserted = tr.doc.content.size - sizeBefore;
  return Math.max(pos, pos + inserted - 1);
}

/** `J` / `gJ`: joins `count` lines onto the cursor line. */
export function joinLines(
  tr: Transaction,
  cursor: number,
  count: number,
  withSpaces: boolean,
): number {
  let line = lineAt(tr.doc, cursor);
  if (!line) return cursor;
  let joinPoint = cursor;
  for (let remaining = Math.max(1, count - 1); remaining > 0; remaining -= 1) {
    const next = lineBelow(tr.doc, line);
    if (!next) break;
    const leading = /^\s*/u.exec(next.text)?.[0].length ?? 0;
    const from = line.end;
    const to = positionAt(next, leading);
    tr.delete(from, to);
    const rest = next.text.slice(leading);
    const needsSpace =
      withSpaces && line.text.length > 0 && !/\s$/u.test(line.text) && rest.length > 0 && !rest.startsWith(")");
    if (needsSpace) tr.insertText(" ", from);
    joinPoint = from;
    const rejoined = lineAt(tr.doc, from);
    if (!rejoined) break;
    line = rejoined;
  }
  return joinPoint;
}

/** `ctrl-a` / `ctrl-x` on the number at or after the cursor. */
export function adjustNumber(
  tr: Transaction,
  line: VimLine,
  number: { from: number; to: number; value: number },
  delta: number,
): number {
  const next = String(number.value + delta);
  tr.insertText(next, positionAt(line, number.from), positionAt(line, number.to));
  return positionAt(line, number.from) + next.length - 1;
}
