import type { WorkspaceNode } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererState } from "@skriuw/renderer-core/store/types";

export type TrashEntry = {
  id: string;
  kind: WorkspaceNode["kind"];
  title: string;
  deletedAt: number;
  descendantCount: number;
};

function hasDeletedAncestor(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  node: WorkspaceNode,
): boolean {
  const visited = new Set<string>();
  let parentId = node.parentId;
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.get(parentId);
    if (!parent) {
      return false;
    }
    if (parent.deletedAt !== null) {
      return true;
    }
    parentId = parent.parentId;
  }
  return false;
}

function isDescendantOf(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  node: WorkspaceNode,
  rootId: string,
): boolean {
  const visited = new Set<string>();
  let parentId = node.parentId;
  while (parentId !== null && !visited.has(parentId)) {
    if (parentId === rootId) {
      return true;
    }
    visited.add(parentId);
    parentId = nodes.get(parentId)?.parentId ?? null;
  }
  return false;
}

export function selectTrashEntries(state: RendererState): TrashEntry[] {
  const roots = [...state.sourceNodes.values()].filter(
    (node): node is WorkspaceNode & { deletedAt: number } =>
      node.deletedAt !== null && !hasDeletedAncestor(state.sourceNodes, node),
  );
  return roots
    .map((root) => ({
      id: root.id,
      kind: root.kind,
      title: root.title,
      deletedAt: root.deletedAt,
      descendantCount: [...state.sourceNodes.values()].filter((node) =>
        isDescendantOf(state.sourceNodes, node, root.id),
      ).length,
    }))
    .sort(
      (left, right) => right.deletedAt - left.deletedAt || left.title.localeCompare(right.title),
    );
}

export function trashEntriesEqual(
  left: readonly TrashEntry[],
  right: readonly TrashEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        entry.id === other.id &&
        entry.kind === other.kind &&
        entry.title === other.title &&
        entry.deletedAt === other.deletedAt &&
        entry.descendantCount === other.descendantCount
      );
    })
  );
}
