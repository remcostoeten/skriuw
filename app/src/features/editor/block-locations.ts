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
