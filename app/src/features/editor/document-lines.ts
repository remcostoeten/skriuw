import type { Node as ProseMirrorNode } from "prosemirror-model";
import { productSchema, serializeProductMarkdown } from "./schema";

/** Where a Markdown line lands in the block document. */
export type DocumentLineTarget = {
  blockIndex: number;
  offset: number;
};

export type DocumentLineIndex = {
  lineCount: number;
  /** One-based Markdown line each top-level block starts on. */
  blockStartLines: readonly number[];
  blockMarkdown: readonly string[];
};

function countLines(text: string): number {
  return text.split("\n").length;
}

function countNewlines(text: string, from: number, to: number): number {
  let total = 0;
  for (let index = from; index < to; index += 1) {
    if (text[index] === "\n") {
      total += 1;
    }
  }
  return total;
}

/**
 * Line numbers in block mode mean lines of the note's Markdown, so the same
 * number selects the same content in either editor. Each top-level block is
 * serialized on its own and located in the whole-document serialization, which
 * measures the real line layout instead of estimating it from block heights.
 *
 * A block whose standalone serialization does not appear verbatim in the whole
 * document falls back to the running line cursor; the next block that does
 * match re-anchors the index, so one odd block cannot skew everything below it.
 */
export function buildDocumentLineIndex(document: ProseMirrorNode): DocumentLineIndex {
  const markdown = serializeProductMarkdown(document);
  const blockStartLines: number[] = [];
  const blockMarkdown: string[] = [];
  let searchFrom = 0;
  let searchFromLine = 1;

  document.forEach((block) => {
    const text = serializeProductMarkdown(productSchema.node("doc", null, [block]));
    blockMarkdown.push(text);
    const at = text.length === 0 ? -1 : markdown.indexOf(text, searchFrom);
    if (at === -1) {
      blockStartLines.push(searchFromLine);
      searchFromLine += countLines(text) + 1;
      return;
    }
    const line = searchFromLine + countNewlines(markdown, searchFrom, at);
    blockStartLines.push(line);
    searchFrom = at + text.length;
    searchFromLine = line + countLines(text) - 1;
  });

  return { lineCount: countLines(markdown), blockStartLines, blockMarkdown };
}

/**
 * Caret offset inside a block for a line that falls within it, so a jump into a
 * fenced code block lands on the requested code line rather than the fence.
 */
function blockLineOffset(
  document: ProseMirrorNode,
  index: DocumentLineIndex,
  blockIndex: number,
  line: number,
): number {
  const relative = line - (index.blockStartLines[blockIndex] ?? 1);
  if (relative <= 0) {
    return 0;
  }
  const lineText = (index.blockMarkdown[blockIndex] ?? "").split("\n")[relative];
  if (!lineText) {
    return 0;
  }
  const offset = document.child(blockIndex).textContent.indexOf(lineText);
  return offset === -1 ? 0 : offset;
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
  let blockIndex = 0;
  for (let current = 0; current < index.blockStartLines.length; current += 1) {
    if ((index.blockStartLines[current] ?? 1) > target) {
      break;
    }
    blockIndex = current;
  }
  blockIndex = Math.min(blockIndex, document.childCount - 1);
  return { blockIndex, offset: blockLineOffset(document, index, blockIndex, target) };
}
