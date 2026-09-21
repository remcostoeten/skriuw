import type { Node as ProseMirrorNode } from "prosemirror-model";

export type BlockLocation = {
  /** Absolute document position of the node carrying the id. */
  position: number;
  /** Index of the top-level block containing it, for bounded-window reveals. */
  blockIndex: number;
};

/**
 * Locates the node carrying a `blockId` attribute. Task surfaces navigate by
 * block identity rather than position, since a source line moves whenever the
 * note above it is edited.
 */
export function findBlockLocation(
  document: ProseMirrorNode,
  blockId: string,
): BlockLocation | null {
  let found: BlockLocation | null = null;
  document.forEach((child, offset, index) => {
    if (found) {
      return;
    }
    if (child.attrs.blockId === blockId) {
      found = { position: offset, blockIndex: index };
      return;
    }
    child.descendants((node, position) => {
      if (found) {
        return false;
      }
      if (node.attrs.blockId === blockId) {
        found = { position: offset + 1 + position, blockIndex: index };
        return false;
      }
      return true;
    });
  });
  return found;
}

/**
 * Locates the first text node anchored to a comment thread. The panel
 * navigates by thread id for the same reason task surfaces navigate by block
 * id: the anchored range moves whenever the note above it is edited.
 *
 * Takes the full document rather than the live view, so a thread anchored
 * outside the current bounded window still resolves.
 */
export function findAnnotationLocation(
  document: ProseMirrorNode,
  threadId: string,
): BlockLocation | null {
  let found: BlockLocation | null = null;
  document.forEach((child, offset, index) => {
    if (found) {
      return;
    }
    child.descendants((node, position) => {
      if (found) {
        return false;
      }
      const anchored = node.marks.some(
        (mark) => mark.type.name === "annotation" && mark.attrs.threadId === threadId,
      );
      if (anchored) {
        found = { position: offset + 1 + position, blockIndex: index };
        return false;
      }
      return true;
    });
  });
  return found;
}
