import type { ProjectedNode, TreeIndex, TreeNode, TreeProjection } from "./types";

export function buildTreeIndex(nodes: readonly ProjectedNode[]): TreeIndex {
  const byId = new Map<string, TreeNode>();
  const childrenByParent = new Map<string | null, TreeNode[]>();
  const order: TreeNode[] = [];
  let maxDepth = 0;

  for (const projected of nodes) {
    const parent = projected.parentId === null ? null : byId.get(projected.parentId);
    const depth = parent ? parent.depth + 1 : 1;
    const node: TreeNode = {
      id: projected.id,
      parentId: projected.parentId,
      kind: projected.kind,
      title: projected.title,
      depth,
      setSize: 0,
      posInSet: 0,
    };
    byId.set(node.id, node);
    order.push(node);
    maxDepth = Math.max(maxDepth, depth);
    const siblings = childrenByParent.get(projected.parentId);
    if (siblings) {
      siblings.push(node);
    } else {
      childrenByParent.set(projected.parentId, [node]);
    }
  }

  for (const siblings of childrenByParent.values()) {
    for (const [position, node] of siblings.entries()) {
      node.setSize = siblings.length;
      node.posInSet = position + 1;
    }
  }

  return { byId, childrenByParent, order, maxDepth };
}

export function flattenVisible(index: TreeIndex, expanded: ReadonlySet<string>): TreeNode[] {
  const visible: TreeNode[] = [];
  const stack: TreeNode[] = [];
  const roots = index.childrenByParent.get(null) ?? [];
  for (let position = roots.length - 1; position >= 0; position -= 1) {
    const root = roots[position];
    if (root) {
      stack.push(root);
    }
  }
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      break;
    }
    visible.push(node);
    if (node.kind !== "folder" || !expanded.has(node.id)) {
      continue;
    }
    const children = index.childrenByParent.get(node.id) ?? [];
    for (let position = children.length - 1; position >= 0; position -= 1) {
      const child = children[position];
      if (child) {
        stack.push(child);
      }
    }
  }
  return visible;
}

export function referenceFlatten(index: TreeIndex, expanded: ReadonlySet<string>): string[] {
  function visit(parentId: string | null): string[] {
    const rows: string[] = [];
    for (const node of index.childrenByParent.get(parentId) ?? []) {
      rows.push(node.id);
      if (node.kind === "folder" && expanded.has(node.id)) {
        rows.push(...visit(node.id));
      }
    }
    return rows;
  }
  return visit(null);
}

export function ancestorIds(index: TreeIndex, id: string): string[] {
  const ancestors: string[] = [];
  let current = index.byId.get(id);
  while (current && current.parentId !== null) {
    ancestors.unshift(current.parentId);
    current = index.byId.get(current.parentId);
  }
  return ancestors;
}

export function allFolderIds(index: TreeIndex): string[] {
  return index.order.filter((node) => node.kind === "folder").map((node) => node.id);
}

export function validateProjection(projection: TreeProjection, index: TreeIndex): string[] {
  const issues: string[] = [];
  const metadata = projection.metadata;
  const seen = new Set<string>();
  let folderCount = 0;
  let noteCount = 0;

  for (const node of projection.nodes) {
    if (seen.has(node.id)) {
      issues.push(`duplicate node id ${node.id}`);
    }
    seen.add(node.id);
    if (node.kind === "folder") {
      folderCount += 1;
    } else {
      noteCount += 1;
    }
    if (node.parentId !== null) {
      const parent = index.byId.get(node.parentId);
      if (!parent) {
        issues.push(`missing parent ${node.parentId} for ${node.id}`);
      } else if (parent.kind !== "folder") {
        issues.push(`non-folder parent ${node.parentId} for ${node.id}`);
      } else if (!seen.has(node.parentId)) {
        issues.push(`parent ${node.parentId} appears after child ${node.id}`);
      }
    }
  }

  if (folderCount !== metadata.folderCount) {
    issues.push(`folder count ${folderCount} != ${metadata.folderCount}`);
  }
  if (noteCount !== metadata.noteCount) {
    issues.push(`note count ${noteCount} != ${metadata.noteCount}`);
  }
  if (noteCount !== metadata.documentCount) {
    issues.push(`document count ${noteCount} != ${metadata.documentCount}`);
  }
  if (projection.nodes.length !== metadata.nodeCount) {
    issues.push(`node count ${projection.nodes.length} != ${metadata.nodeCount}`);
  }
  if (index.maxDepth !== metadata.maxDepth) {
    issues.push(`max depth ${index.maxDepth} != ${metadata.maxDepth}`);
  }
  if (projection.operationsDigest.length !== 64) {
    issues.push(`unexpected digest ${projection.operationsDigest}`);
  }
  if (projection.activeNoteId !== null && !index.byId.has(projection.activeNoteId)) {
    issues.push(`missing active note ${projection.activeNoteId}`);
  }
  return issues;
}
