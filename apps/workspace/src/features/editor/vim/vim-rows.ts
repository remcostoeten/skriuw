import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { lastCursorIndex, lineAbove, lineAt, lineBelow, lineOffset, positionAt, type VimLine } from "./vim-lines";

/** Screen box of the character a cursor index sits on, as the view laid it out. */
export type RowRect = { left: number; top: number; bottom: number };

/** Measures a document position; null when the view has no layout for it. */
export type RowMeasure = (pos: number) => RowRect | null;

export type RowStep = { pos: number; x: number };

/** Cursor indexes, inclusive, of one row the view wrapped a line into. */
export type RowSpan = { start: number; end: number };

/** Measures positions through the view's own layout; null where the view has none. */
export function viewRowMeasure(view: EditorView): RowMeasure {
  return (pos) => {
    try {
      const coords = view.coordsAtPos(pos);
      return { left: coords.left, top: coords.top, bottom: coords.bottom };
    } catch {
      return null;
    }
  };
}

type Row = { line: VimLine; start: number; end: number };

function overlaps(a: RowRect, b: RowRect): boolean {
  return a.top < b.bottom && b.top < a.bottom;
}

function rectAt(measure: RowMeasure, line: VimLine, index: number): RowRect | null {
  return measure(positionAt(line, index));
}

function rowEndFrom(measure: RowMeasure, line: VimLine, index: number, reference: RowRect): number | null {
  let low = index;
  let high = lastCursorIndex(line);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const rect = rectAt(measure, line, mid);
    if (!rect) return null;
    if (overlaps(rect, reference)) low = mid;
    else high = mid - 1;
  }
  return low;
}

function rowStartFrom(measure: RowMeasure, line: VimLine, index: number, reference: RowRect): number | null {
  let low = 0;
  let high = index;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const rect = rectAt(measure, line, mid);
    if (!rect) return null;
    if (overlaps(rect, reference)) high = mid;
    else low = mid + 1;
  }
  return low;
}

function rowStartingAt(measure: RowMeasure, line: VimLine, start: number): Row | null {
  const rect = rectAt(measure, line, start);
  if (!rect) return null;
  const end = rowEndFrom(measure, line, start, rect);
  return end === null ? null : { line, start, end };
}

function rowEndingAt(measure: RowMeasure, line: VimLine, end: number): Row | null {
  const rect = rectAt(measure, line, end);
  if (!rect) return null;
  const start = rowStartFrom(measure, line, end, rect);
  return start === null ? null : { line, start, end };
}

function rowBelow(doc: ProseMirrorNode, measure: RowMeasure, line: VimLine, index: number): Row | null {
  const reference = rectAt(measure, line, index);
  if (!reference) return null;
  const end = rowEndFrom(measure, line, index, reference);
  if (end === null) return null;
  if (end < lastCursorIndex(line)) return rowStartingAt(measure, line, end + 1);
  const below = lineBelow(doc, line);
  return below ? rowStartingAt(measure, below, 0) : null;
}

function rowAbove(doc: ProseMirrorNode, measure: RowMeasure, line: VimLine, index: number): Row | null {
  const reference = rectAt(measure, line, index);
  if (!reference) return null;
  const start = rowStartFrom(measure, line, index, reference);
  if (start === null) return null;
  if (start > 0) return rowEndingAt(measure, line, start - 1);
  const above = lineAbove(doc, line);
  return above ? rowEndingAt(measure, above, lastCursorIndex(above)) : null;
}

/** The last character on the row whose box starts at or before `goalX`; `Infinity` picks the row end. */
function indexNearX(measure: RowMeasure, row: Row, goalX: number): number | null {
  if (!Number.isFinite(goalX)) return goalX > 0 ? row.end : row.start;
  let low = row.start;
  let high = row.end;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const rect = rectAt(measure, row.line, mid);
    if (!rect) return null;
    if (rect.left > goalX) high = mid;
    else low = mid + 1;
  }
  const rect = rectAt(measure, row.line, low);
  if (!rect) return null;
  return rect.left > goalX ? Math.max(row.start, low - 1) : low;
}

/**
 * The rows the view wrapped `line` into, in order, read from the boxes of the
 * characters themselves so inline content taller than the line box does not
 * count as extra rows. Null when the view has no layout for the line.
 */
export function rowSpansOfLine(measure: RowMeasure, line: VimLine): RowSpan[] | null {
  const last = lastCursorIndex(line);
  const first = rectAt(measure, line, 0);
  const end = rectAt(measure, line, last);
  if (!first || !end) return null;
  if (overlaps(first, end)) return [{ start: 0, end: last }];
  const spans: RowSpan[] = [];
  let start = 0;
  while (start <= last) {
    const row = rowStartingAt(measure, line, start);
    if (!row) return null;
    spans.push({ start: row.start, end: row.end });
    if (row.end >= last) break;
    start = row.end + 1;
  }
  return spans;
}

/**
 * Moves `count` display rows from `pos`, walking the rows the view wrapped a
 * line into before crossing to the neighbouring line, like Vim's `gj`/`gk`.
 * `goalX` is the horizontal position to return to; null takes the cursor's own.
 * Returns null when the view has no layout or the cursor cannot move at all.
 */
export function stepDisplayRow(
  doc: ProseMirrorNode,
  measure: RowMeasure,
  pos: number,
  direction: 1 | -1,
  count: number,
  goalX: number | null,
): RowStep | null {
  const line = lineAt(doc, pos);
  if (!line) return null;
  const origin = rectAt(measure, line, Math.min(lineOffset(line, pos), lastCursorIndex(line)));
  if (!origin || !(origin.bottom > origin.top)) return null;
  const x = goalX ?? origin.left;
  let current = { line, index: Math.min(lineOffset(line, pos), lastCursorIndex(line)) };
  let moved = 0;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    const row =
      direction === 1
        ? rowBelow(doc, measure, current.line, current.index)
        : rowAbove(doc, measure, current.line, current.index);
    if (!row) break;
    const index = indexNearX(measure, row, x);
    if (index === null) break;
    current = { line: row.line, index };
    moved += 1;
  }
  if (moved === 0) return null;
  return { pos: positionAt(current.line, current.index), x };
}
