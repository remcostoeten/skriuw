import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import {
  buildRowLayout,
  locateRow,
  rowNumberAt,
  type RawMarkdownRowLayout,
} from "./raw-markdown-editor-model";
import { allLines, lastCursorIndex, lineOffset, positionAt, type VimLine } from "./vim/vim-lines";
import { rowSpansOfLine, viewRowMeasure, type RowMeasure, type RowSpan } from "./vim/vim-rows";

/**
 * Where every line of the rendered document starts in the numbering of wrapped
 * screen rows, so the rendered editor counts the same way the raw view does.
 * Positions are valid for `doc` only.
 */
export type DisplayRowLayout = RawMarkdownRowLayout & {
  doc: ProseMirrorNode;
  lines: readonly VimLine[];
  spans: readonly (readonly RowSpan[])[];
};

export type DisplayRowLayoutCache = {
  current: DisplayRowLayout | null;
  width: number;
};

export function createDisplayRowLayoutCache(): DisplayRowLayoutCache {
  return { current: null, width: 0 };
}

function spansOf(measure: RowMeasure, line: VimLine): RowSpan[] {
  return rowSpansOfLine(measure, line) ?? [{ start: 0, end: lastCursorIndex(line) }];
}

export function buildDisplayRowLayout(doc: ProseMirrorNode, measure: RowMeasure): DisplayRowLayout {
  const lines = allLines(doc);
  const spans = lines.map((line) => spansOf(measure, line));
  return { ...buildRowLayout(spans.map((rows) => rows.length)), doc, lines, spans };
}

/** The line holding `pos`, or the first line after it when `pos` sits in a non-text block. */
function lineIndexAt(layout: DisplayRowLayout, pos: number): number {
  const index = layout.lines.findIndex((line) => pos <= line.end);
  return index === -1 ? layout.lines.length - 1 : index;
}

/** Document-wide row number of the row holding `pos`. */
export function displayRowAt(layout: DisplayRowLayout, pos: number): number {
  const lineIndex = lineIndexAt(layout, pos);
  const line = layout.lines[lineIndex];
  const spans = layout.spans[lineIndex];
  if (!line || !spans) {
    return 1;
  }
  const index = pos < line.start ? 0 : Math.min(lineOffset(line, pos), lastCursorIndex(line));
  const within = spans.findIndex((span) => index <= span.end);
  return rowNumberAt(layout, lineIndex, within === -1 ? spans.length - 1 : within);
}

/** Document position at the start of a document-wide row, clamped into the document. */
export function displayRowPosition(layout: DisplayRowLayout, row: number): number {
  const { lineIndex, rowIndex } = locateRow(layout, row);
  const line = layout.lines[lineIndex];
  if (!line) {
    return 0;
  }
  const span = layout.spans[lineIndex]?.[rowIndex];
  return positionAt(line, span?.start ?? 0);
}

/**
 * The layout of the view's current document, rebuilt only when the document
 * or the editor width changed since the cached one was measured.
 */
export function viewDisplayRowLayout(
  view: EditorView,
  cache?: DisplayRowLayoutCache,
): DisplayRowLayout {
  const width = view.dom.clientWidth;
  const cached = cache?.current;
  if (cache && cached && cached.doc === view.state.doc && cache.width === width) {
    return cached;
  }
  const layout = buildDisplayRowLayout(view.state.doc, viewRowMeasure(view));
  if (cache) {
    cache.current = layout;
    cache.width = width;
  }
  return layout;
}
