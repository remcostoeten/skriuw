import type { NodeKind } from "../../../shared/renderer-core/src/contracts/workspace";
import { pinnedNodeIds } from "../../../shared/renderer-core/src/store/tree";
import type { RendererState, Selector } from "../../../shared/renderer-core/src/store/types";

export type TreeRow = {
  id: string;
  kind: NodeKind;
  title: string;
  depth: number;
  /** Direct children, shown on folders so a collapsed level still says how much it holds. */
  childCount: number;
  expanded: boolean;
  pinned: boolean;
  active: boolean;
  setSize: number;
  posInSet: number;
};

export const TREE_BASE_INDENT = 12;
export const TREE_DEPTH_INDENT = 14;
export const TREE_MAXIMUM_INDENT = 96;

export function treeIndent(depth: number): number {
  return Math.min(
    TREE_BASE_INDENT + Math.max(0, depth - 1) * TREE_DEPTH_INDENT,
    TREE_MAXIMUM_INDENT,
  );
}

export function visibleIdsSelector(state: RendererState): readonly string[] {
  return state.visibleIds;
}

export function idListsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * One row's view of the tree. Each row subscribes through its own selector so
 * renaming, pinning or expanding a node re-renders that row alone, not the
 * list (`docs/performance-contract.md`).
 */
export function treeRowSelector(id: string): Selector<TreeRow | null> {
  return (state) => {
    const node = state.nodes.get(id);
    if (!node) {
      return null;
    }
    return {
      id,
      kind: node.kind,
      title: node.title,
      depth: node.depth,
      childCount: state.childrenByParent.get(id)?.length ?? 0,
      expanded: state.expandedIds.has(id),
      pinned: state.sourceNodes.get(id)?.pinnedAt != null,
      active: state.activeNoteId === id,
      setSize: node.setSize,
      posInSet: node.posInSet,
    };
  };
}

export function treeRowsEqual(left: TreeRow | null, right: TreeRow | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.title === right.title &&
    left.depth === right.depth &&
    left.childCount === right.childCount &&
    left.expanded === right.expanded &&
    left.pinned === right.pinned &&
    left.active === right.active &&
    left.setSize === right.setSize &&
    left.posInSet === right.posInSet
  );
}

export type PinnedEntry = {
  id: string;
  title: string;
};

/** Pinned, available nodes, most recently pinned first (`shared/renderer-core/store/tree`). */
export function pinnedEntriesSelector(state: RendererState): PinnedEntry[] {
  return pinnedNodeIds([...state.sourceNodes.values()]).map((id) => ({
    id,
    title: nodeTitle(state, id),
  }));
}

export function pinnedEntriesEqual(
  left: readonly PinnedEntry[],
  right: readonly PinnedEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return other !== undefined && entry.id === other.id && entry.title === other.title;
    })
  );
}

export function nodeTitle(state: RendererState, id: string): string {
  return state.nodes.get(id)?.title ?? "Untitled";
}

/**
 * What VoiceOver and TalkBack read for a row: the name first, then the facts a
 * sighted reader takes from the row's shape (R-Q2).
 */
export function treeRowAccessibilityLabel(row: TreeRow): string {
  const parts = [row.title, row.kind === "folder" ? "folder" : "note"];
  if (row.kind === "folder") {
    parts.push(row.childCount === 1 ? "1 item" : `${row.childCount} items`);
  }
  if (row.pinned) {
    parts.push("pinned");
  }
  parts.push(`level ${row.depth}`, `${row.posInSet} of ${row.setSize}`);
  return parts.join(", ");
}

export function treeRowAccessibilityHint(row: TreeRow): string {
  return row.kind === "folder"
    ? "Double tap to expand or collapse. Double tap and hold for actions."
    : "Double tap to open. Double tap and hold for actions.";
}
