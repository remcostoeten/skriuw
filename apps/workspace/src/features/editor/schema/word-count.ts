import type { Node as ProseMirrorNode } from "prosemirror-model";
import { readDiagramModel } from "../diagrams/model";

const blockWordCounts = new WeakMap<ProseMirrorNode, number>();

function wordsIn(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

function countNodeWords(node: ProseMirrorNode): number {
  if (node.type.name === "diagram") {
    let words = 0;
    for (const item of readDiagramModel(node.attrs.model).nodes) words += wordsIn(item.label);
    return words;
  }
  if (node.isText) return node.text ? wordsIn(node.text) : 0;
  let words = 0;
  node.forEach((child) => {
    words += countNodeWords(child);
  });
  return words;
}

/**
 * @name countWords
 * @description Counts the words in a document, including diagram node labels.
 * Counts are memoised per top-level block node, so a save after an edit
 * recounts only the blocks the edit replaced.
 *
 * @example
 * const wordCount = countWords(view.state.doc);
 */
export function countWords(document: ProseMirrorNode): number {
  let words = 0;
  document.forEach((block) => {
    let blockWords = blockWordCounts.get(block);
    if (blockWords === undefined) {
      blockWords = countNodeWords(block);
      blockWordCounts.set(block, blockWords);
    }
    words += blockWords;
  });
  return words;
}
