import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import {
  buildRowLayout,
  locateRow,
  rowNumberAt,
  type RawMarkdownRowLayout,
} from "./raw-markdown-editor-model";
import { allLines, lastCursorIndex, lineAt, lineOffset, positionAt, type VimLine } from "./vim/vim-lines";
import { stepDisplayRow, type RowMeasure } from "./vim/vim-rows";

/** Height of one wrapped row of a line; null when the view has no layout for it. */
export type RowHeightMeasure = (line: VimLine) => number | null;

/**
 * Where every line of the rendered document starts in the numbering of wrapped
 * screen rows, so the rendered editor counts the same way the raw view does.
 */
export type DisplayRowLayout = RawMarkdownRowLayout & {
  lines: readonly VimLine[];
};

function rowIndexWithin(measure: RowMeasure, rowHeight: RowHeightMeasure, line: VimLine, index: number): number {
  const first = measure(positionAt(line, 0));
  const at = measure(positionAt(line, index));
  const height = rowHeight(line) ?? (first ? first.bottom - first.top : 0);
  if (!first || !at || !(height > 0)) {
    return 0;
  }
  return Math.max(0, Math.round((at.top - first.top) / height));
}

function rowsOfLine(measure: RowMeasure, rowHeight: RowHeightMeasure, line: VimLine): number {
  const first = measure(positionAt(line, 0));
  const last = measure(positionAt(line, lastCursorIndex(line)));
  const height = rowHeight(line) ?? (first ? first.bottom - first.top : 0);
  if (!first || !last || !(height > 0)) {
    return 1;
  }
  return 1 + Math.max(0, Math.round((last.top - first.top) / height));
}

export function buildDisplayRowLayout(
  doc: ProseMirrorNode,
  measure: RowMeasure,
  rowHeight: RowHeightMeasure,
): DisplayRowLayout {
  const lines = allLines(doc);
  const layout = buildRowLayout(lines.map((line) => rowsOfLine(measure, rowHeight, line)));
  return { ...layout, lines };
}

function lineIndexOf(layout: DisplayRowLayout, doc: ProseMirrorNode, pos: number): number {
  const line = lineAt(doc, pos);
  if (!line) {
    return 0;
  }
  const index = layout.lines.findIndex(
    (candidate) => candidate.blockPos === line.blockPos && candidate.segmentIndex === line.segmentIndex,
  );
  return Math.max(0, index);
}

/** Document-wide row number of the row holding `pos`. */
export function displayRowAt(
  doc: ProseMirrorNode,
  layout: DisplayRowLayout,
  measure: RowMeasure,
  rowHeight: RowHeightMeasure,
  pos: number,
): number {
  const line = lineAt(doc, pos);
  if (!line) {
    return 1;
  }
  const lineIndex = lineIndexOf(layout, doc, pos);
  const index = Math.min(lineOffset(line, pos), lastCursorIndex(line));
  return rowNumberAt(layout, lineIndex, rowIndexWithin(measure, rowHeight, line, index));
}

/** Document position at the start of a document-wide row, clamped into the document. */
export function displayRowPosition(
  doc: ProseMirrorNode,
  layout: DisplayRowLayout,
  measure: RowMeasure,
  row: number,
): number {
  const { lineIndex, rowIndex } = locateRow(layout, row);
  const line = layout.lines[lineIndex];
  if (!line) {
    return 0;
  }
  const start = positionAt(line, 0);
  if (rowIndex === 0) {
    return start;
  }
  const stepped = stepDisplayRow(doc, measure, start, 1, rowIndex, null);
  return stepped && stepped.pos <= line.end ? stepped.pos : start;
}

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

/** The textblock's computed line height; null before layout or when the DOM is unavailable. */
export function viewRowHeight(view: EditorView): RowHeightMeasure {
  return (line) => {
    if (typeof getComputedStyle !== "function") {
      return null;
    }
    const dom = view.nodeDOM(line.blockPos);
    if (!(dom instanceof HTMLElement)) {
      return null;
    }
    const height = Number.parseFloat(getComputedStyle(dom).lineHeight);
    return Number.isFinite(height) && height > 0 ? height : null;
  };
}

export function viewDisplayRowLayout(view: EditorView): DisplayRowLayout {
  return buildDisplayRowLayout(view.state.doc, viewRowMeasure(view), viewRowHeight(view));
}
