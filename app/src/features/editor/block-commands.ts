import { selectAll } from "prosemirror-commands";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { NodeSelection, TextSelection, type Command } from "prosemirror-state";

export type BlockLocation = {
  pos: number;
  node: ProseMirrorNode;
};

/**
 * Resolves any document position to the top-level block containing it. Returns
 * null only for positions with no block to act on, which in practice means an
 * empty document.
 */
export function topLevelBlockAt(
  doc: ProseMirrorNode,
  position: number,
): BlockLocation | null {
  if (position < 0 || position > doc.content.size) return null;
  const $position = doc.resolve(position);
  if ($position.depth === 0) {
    const after = $position.nodeAfter;
    if (after) return { pos: position, node: after };
    const before = $position.nodeBefore;
    return before ? { pos: position - before.nodeSize, node: before } : null;
  }
  const pos = $position.before(1);
  const node = doc.nodeAt(pos);
  return node ? { pos, node } : null;
}

export function blockIndexAt(doc: ProseMirrorNode, position: number): number | null {
  const block = topLevelBlockAt(doc, position);
  return block ? doc.resolve(block.pos).index(0) : null;
}

export function duplicateBlock(position: number): Command {
  return (state, dispatch) => {
    const block = topLevelBlockAt(state.doc, position);
    if (!block) return false;
    if (dispatch) {
      const after = block.pos + block.node.nodeSize;
      const transaction = state.tr.insert(after, block.node);
      transaction.setSelection(NodeSelection.create(transaction.doc, after));
      dispatch(transaction.scrollIntoView());
    }
    return true;
  };
}

export function deleteBlock(position: number): Command {
  return (state, dispatch) => {
    const block = topLevelBlockAt(state.doc, position);
    if (!block) return false;
    if (dispatch) {
      const end = block.pos + block.node.nodeSize;
      const transaction = state.tr;
      if (state.doc.childCount === 1) {
        const fallback = state.doc.type.contentMatch.defaultType?.createAndFill();
        if (!fallback) return false;
        transaction.replaceWith(block.pos, end, fallback);
        transaction.setSelection(TextSelection.near(transaction.doc.resolve(block.pos)));
      } else {
        transaction.delete(block.pos, end);
        transaction.setSelection(
          TextSelection.near(transaction.doc.resolve(Math.min(block.pos, transaction.doc.content.size)), -1),
        );
      }
      dispatch(transaction.scrollIntoView());
    }
    return true;
  };
}

export function insertBlockAfter(position: number): Command {
  return (state, dispatch) => {
    const block = topLevelBlockAt(state.doc, position);
    if (!block) return false;
    const paragraph = state.doc.type.contentMatch.defaultType?.createAndFill();
    if (!paragraph) return false;
    if (dispatch) {
      const after = block.pos + block.node.nodeSize;
      const transaction = state.tr.insert(after, paragraph);
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(after)));
      dispatch(transaction.scrollIntoView());
    }
    return true;
  };
}

export function moveBlock(position: number, direction: -1 | 1): Command {
  return (state, dispatch) => {
    const block = topLevelBlockAt(state.doc, position);
    if (!block) return false;
    const index = state.doc.resolve(block.pos).index(0);
    const target = index + direction;
    if (target < 0 || target >= state.doc.childCount) return false;
    if (dispatch) {
      const neighbour = state.doc.child(target);
      const offset = Math.max(0, Math.min(state.selection.from - block.pos, block.node.nodeSize - 1));
      const insertAt =
        direction === 1 ? block.pos + neighbour.nodeSize : block.pos - neighbour.nodeSize;
      const transaction = state.tr.delete(block.pos, block.pos + block.node.nodeSize);
      transaction.insert(insertAt, block.node);
      transaction.setSelection(
        state.selection instanceof NodeSelection
          ? NodeSelection.create(transaction.doc, insertAt)
          : TextSelection.near(transaction.doc.resolve(insertAt + offset)),
      );
      dispatch(transaction.scrollIntoView());
    }
    return true;
  };
}

/**
 * Moves the block containing `position` so that it sits at `toIndex` among the
 * document's top-level children, where `toIndex` counts gaps between blocks:
 * 0 is above the first block and `childCount` is below the last.
 */
export function moveBlockToIndex(position: number, toIndex: number): Command {
  return (state, dispatch) => {
    const block = topLevelBlockAt(state.doc, position);
    if (!block) return false;
    if (toIndex < 0 || toIndex > state.doc.childCount) return false;
    const fromIndex = state.doc.resolve(block.pos).index(0);
    if (toIndex === fromIndex || toIndex === fromIndex + 1) return false;
    if (dispatch) {
      let insertAt = 0;
      for (let index = 0; index < toIndex; index += 1) {
        insertAt += state.doc.child(index).nodeSize;
      }
      const transaction = state.tr.delete(block.pos, block.pos + block.node.nodeSize);
      const mapped = transaction.mapping.map(insertAt);
      transaction.insert(mapped, block.node);
      transaction.setSelection(NodeSelection.create(transaction.doc, mapped));
      dispatch(transaction.scrollIntoView());
    }
    return true;
  };
}

/**
 * Select-all that escalates: the first press selects the textblock holding the
 * cursor, and any press once that block is already fully covered falls through
 * to the document. A selection that spans blocks, or sits in a block with no
 * content to cover, skips straight to the document.
 */
export function selectBlockThenDocument(): Command {
  return (state, dispatch) => {
    const { $from, $to, from, to } = state.selection;
    if ($from.parent === $to.parent && $from.parent.isTextblock) {
      const start = $from.start();
      const end = $from.end();
      if (start < end && (from > start || to < end)) {
        if (dispatch) {
          dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)));
        }
        return true;
      }
    }
    return selectAll(state, dispatch);
  };
}

export function moveSelectedBlock(direction: -1 | 1): Command {
  return (state, dispatch) => moveBlock(state.selection.from, direction)(state, dispatch);
}
