import type { Node as ProseMirrorNode } from "prosemirror-model";
import { allLines, lineOffset } from "../../../../src/features/editor/vim/vim-lines";
import type { RowMeasure } from "../../../../src/features/editor/vim/vim-rows";

export const CHAR_WIDTH = 10;
export const ROW_HEIGHT = 20;
const BLOCK_GAP = 30;

/** Lays every Vim line out in a monospace column `width` characters wide, stacking blocks with a gap. */
export function wrappedLayout(doc: ProseMirrorNode, width: number): RowMeasure {
  const lines = allLines(doc);
  const tops: number[] = [];
  let y = 0;
  for (const line of lines) {
    tops.push(y);
    y += Math.max(1, Math.ceil(line.text.length / width)) * ROW_HEIGHT + BLOCK_GAP;
  }
  return (pos) => {
    const at = lines.findIndex((line) => pos >= line.start && pos <= line.end);
    if (at === -1) return null;
    const index = lineOffset(lines[at]!, pos);
    const top = tops[at]! + Math.floor(index / width) * ROW_HEIGHT;
    return { left: (index % width) * CHAR_WIDTH, top, bottom: top + ROW_HEIGHT };
  };
}
