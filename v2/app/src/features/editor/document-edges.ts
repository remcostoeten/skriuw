import { Selection } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";

export type DocumentEdge = "start" | "end";

/** Caret selection at the very start or the very end of a ProseMirror document. */
export function documentEdgeSelection(
  document: ProseMirrorNode,
  edge: DocumentEdge,
): Selection {
  return edge === "start" ? Selection.atStart(document) : Selection.atEnd(document);
}

/**
 * Window start that brings a bounded document's edge block into the live
 * editor, so jumping to the end of a windowed note lands on the real last
 * block instead of the last block of the current window.
 */
export function documentEdgeWindowStart(
  blockCount: number,
  blockLimit: number,
  edge: DocumentEdge,
): number {
  return edge === "start" ? 0 : Math.max(0, blockCount - blockLimit);
}

/** Textarea caret offset for the start or end of raw Markdown source. */
export function textEdgeOffset(text: string, edge: DocumentEdge): number {
  return edge === "start" ? 0 : text.length;
}
