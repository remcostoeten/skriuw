import type { WorkspaceNode } from "../contracts/workspace";

export type TrashRoot = {
  id: string;
  kind: WorkspaceNode["kind"];
  title: string;
  deletedAt: number;
  descendantCount: number;
  noteCount: number;
  folderCount: number;
};

function compareNodes(left: WorkspaceNode, right: WorkspaceNode): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  return left.id < right.id ? -1 : 1;
}

export function isNodeInSubtree(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  nodeId: string,
  rootId: string,
): boolean {
  let currentId: string | null = nodeId;
  const visited = new Set<string>();
  while (currentId !== null && !visited.has(currentId)) {
    if (currentId === rootId) {
      return true;
    }
    visited.add(currentId);
    currentId = nodes.get(currentId)?.parentId ?? null;
  }
  return false;
}

export function trashedSubtreeNodes(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  rootId: string,
): WorkspaceNode[] {
  const children = new Map<string, WorkspaceNode[]>();
  for (const node of nodes.values()) {
    if (node.parentId === null) {
      continue;
    }
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort(compareNodes);
  }
  const ordered: WorkspaceNode[] = [];
  const root = nodes.get(rootId);
  if (!root) {
    return ordered;
  }
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    ordered.push(node);
    const childNodes = children.get(node.id) ?? [];
    for (let index = childNodes.length - 1; index >= 0; index -= 1) {
      const child = childNodes[index];
      if (child) {
        stack.push(child);
      }
    }
  }
  return ordered;
}

export function trashedRoots(nodes: ReadonlyMap<string, WorkspaceNode>): TrashRoot[] {
  const roots: TrashRoot[] = [];
  for (const node of nodes.values()) {
    if (node.deletedAt === null) {
      continue;
    }
    let parentId = node.parentId;
    let inherited = false;
    const visited = new Set<string>();
    while (parentId !== null && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nodes.get(parentId);
      if (!parent) {
        break;
      }
      if (parent.deletedAt !== null) {
        inherited = true;
        break;
      }
      parentId = parent.parentId;
    }
    if (inherited) {
      continue;
    }
    const subtree = trashedSubtreeNodes(nodes, node.id);
    roots.push({
      id: node.id,
      kind: node.kind,
      title: node.title,
      deletedAt: node.deletedAt,
      descendantCount: Math.max(0, subtree.length - 1),
      noteCount: subtree.filter((entry) => entry.kind === "note").length,
      folderCount: subtree.filter((entry) => entry.kind === "folder").length,
    });
  }
  return roots.sort((left, right) => {
    if (left.deletedAt !== right.deletedAt) {
      return right.deletedAt - left.deletedAt;
    }
    return left.title.localeCompare(right.title);
  });
}
