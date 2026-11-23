import type { Node as ProseMirrorNode } from "prosemirror-model";

export type NumberedLine = {
  number: number;
  anchor: number;
  anchorKind: "text" | "node";
  from: number;
  to: number;
};

const lineStartCache = new WeakMap<ProseMirrorNode, readonly number[]>();
const lineCountCache = new WeakMap<ProseMirrorNode, number>();

function isSingleLine(node: ProseMirrorNode): boolean {
  return node.type.name === "table_row" || node.isLeaf || node.isAtom;
}

/**
 * @name lineStartOffsets
 * @description Offsets, from the start of a textblock's content, at which each
 * of its lines begins. A hard break or a newline character starts a new line,
 * so a code block yields one entry per source line.
 *
 * @example
 * const lines = lineStartOffsets(codeBlock).length;
 */
export function lineStartOffsets(block: ProseMirrorNode): readonly number[] {
  const cached = lineStartCache.get(block);
  if (cached) {
    return cached;
  }
  const starts = [0];
  let offset = 0;
  block.forEach((child) => {
    if (child.isText) {
      const value = child.text ?? "";
      let index = value.indexOf("\n");
      while (index !== -1) {
        starts.push(offset + index + 1);
        index = value.indexOf("\n", index + 1);
      }
    } else if (child.type.name === "hard_break") {
      starts.push(offset + child.nodeSize);
    }
    offset += child.nodeSize;
  });
  lineStartCache.set(block, starts);
  return starts;
}

/**
 * @name lineCount
 * @description How many numbered lines a node contributes. Textblocks count
 * their break-separated lines, a table row and any leaf block (image, diagram,
 * rule, embedded view) count as one, and containers add up their children.
 *
 * @example
 * const total = lineCount(doc);
 */
export function lineCount(node: ProseMirrorNode): number {
  const cached = lineCountCache.get(node);
  if (cached !== undefined) {
    return cached;
  }
  let count = 0;
  if (node.isTextblock) {
    count = lineStartOffsets(node).length;
  } else if (isSingleLine(node)) {
    count = 1;
  } else {
    node.forEach((child) => {
      count += lineCount(child);
    });
  }
  lineCountCache.set(node, count);
  return count;
}

/**
 * @name linesBefore
 * @description Lines contributed by the first `blockCount` top-level blocks of
 * a document, which is the offset a windowed editor adds to its own numbering.
 *
 * @example
 * const first = 1 + linesBefore(fullDocument, windowStart);
 */
export function linesBefore(doc: ProseMirrorNode, blockCount: number): number {
  let count = 0;
  const limit = Math.min(blockCount, doc.childCount);
  for (let index = 0; index < limit; index += 1) {
    count += lineCount(doc.child(index));
  }
  return count;
}

function firstTextPosition(node: ProseMirrorNode, pos: number): number | null {
  if (node.isTextblock) {
    return pos + 1;
  }
  let found: number | null = null;
  node.descendants((child, offset) => {
    if (found !== null) {
      return false;
    }
    if (child.isTextblock) {
      found = pos + 1 + offset + 1;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * @name textblockLines
 * @description The numbered lines of one textblock within an index range, so a
 * long code block only yields the lines that are on screen.
 *
 * @example
 * textblockLines(block, pos, firstNumber, 0, lineCount(block));
 */
export function textblockLines(
  block: ProseMirrorNode,
  pos: number,
  firstNumber: number,
  fromIndex: number,
  toIndex: number,
): NumberedLine[] {
  const starts = lineStartOffsets(block);
  const contentStart = pos + 1;
  const contentEnd = contentStart + block.content.size;
  const lines: NumberedLine[] = [];
  for (let index = Math.max(0, fromIndex); index < Math.min(toIndex, starts.length); index += 1) {
    const from = contentStart + (starts[index] ?? 0);
    const next = starts[index + 1];
    lines.push({
      number: firstNumber + index,
      anchor: from,
      anchorKind: "text",
      from,
      to: next === undefined ? contentEnd : contentStart + next - 1,
    });
  }
  return lines;
}

/**
 * @name singleLine
 * @description The one numbered line of a table row or leaf block. A row is
 * anchored on its first cell's text so the number sits on the row's first line
 * of text; a block without text is anchored on its own box.
 *
 * @example
 * singleLine(imageNode, pos, 12);
 */
export function singleLine(node: ProseMirrorNode, pos: number, number: number): NumberedLine {
  const text = firstTextPosition(node, pos);
  return {
    number,
    anchor: text ?? pos,
    anchorKind: text === null ? "node" : "text",
    from: pos,
    to: pos + node.nodeSize - 1,
  };
}

/**
 * @name isLineUnit
 * @description Whether a node is numbered as a whole rather than through its
 * children: a textblock, a table row, or a leaf block.
 *
 * @example
 * if (isLineUnit(node)) emit(node);
 */
export function isLineUnit(node: ProseMirrorNode): boolean {
  return node.isTextblock || isSingleLine(node);
}

/**
 * @name documentLines
 * @description Every numbered line of a document in order. The gutter itself
 * walks only what is on screen; this is the full list for tests and tooling.
 *
 * @example
 * const numbers = documentLines(doc).map((line) => line.number);
 */
export function documentLines(doc: ProseMirrorNode, firstNumber = 1): NumberedLine[] {
  const lines: NumberedLine[] = [];
  let number = firstNumber;
  function walk(node: ProseMirrorNode, pos: number): void {
    if (node.isTextblock) {
      lines.push(...textblockLines(node, pos, number, 0, lineCount(node)));
    } else if (isSingleLine(node)) {
      lines.push(singleLine(node, pos, number));
    } else {
      node.forEach((child, offset) => walk(child, pos + 1 + offset));
      return;
    }
    number += lineCount(node);
  }
  doc.forEach((child, offset) => walk(child, offset));
  return lines;
}

/**
 * @name activeLineIndex
 * @description Index of the line holding a document position, or -1 when the
 * position sits on none of them.
 *
 * @example
 * activeLineIndex(lines, state.selection.head);
 */
export function activeLineIndex(lines: readonly NumberedLine[], pos: number): number {
  return lines.findIndex((line) => pos >= line.from && pos <= line.to);
}
