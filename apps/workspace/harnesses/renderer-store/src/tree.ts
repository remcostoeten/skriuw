import type { NodeRecord, ProjectedNode, RendererState } from "./types";

export function buildNodeIndex(nodes: readonly ProjectedNode[]): Pick<
  RendererState,
  "nodes" | "childrenByParent" | "nodeOrder"
> {
  const byId = new Map<string, NodeRecord>();
  const children = new Map<string | null, string[]>();
  const order: string[] = [];

  for (const projected of nodes) {
    const parent = projected.parentId === null ? null : byId.get(projected.parentId);
    const siblings = children.get(projected.parentId) ?? [];
    const node: NodeRecord = {
      ...projected,
      depth: parent ? parent.depth + 1 : 1,
      setSize: 0,
      posInSet: siblings.length + 1,
    };
    siblings.push(node.id);
    children.set(projected.parentId, siblings);
    byId.set(node.id, node);
    order.push(node.id);
  }

  for (const siblingIds of children.values()) {
    for (const id of siblingIds) {
      const node = byId.get(id);
      if (node) {
        node.setSize = siblingIds.length;
      }
    }
  }

  return { nodes: byId, childrenByParent: children, nodeOrder: order };
}

export function flattenVisible(
  nodes: ReadonlyMap<string, NodeRecord>,
  childrenByParent: ReadonlyMap<string | null, readonly string[]>,
  expandedIds: ReadonlySet<string>,
): string[] {
  const visible: string[] = [];
  const roots = childrenByParent.get(null) ?? [];
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) {
      break;
    }
    visible.push(id);
    const node = nodes.get(id);
    if (!node || node.kind !== "folder" || !expandedIds.has(id)) {
      continue;
    }
    const childIds = childrenByParent.get(id) ?? [];
    for (let position = childIds.length - 1; position >= 0; position -= 1) {
      const childId = childIds[position];
      if (childId) {
        stack.push(childId);
      }
    }
  }
  return visible;
}

export function ancestorIds(nodes: ReadonlyMap<string, NodeRecord>, id: string): string[] {
  const ancestors: string[] = [];
  let current = nodes.get(id);
  while (current?.parentId) {
    ancestors.unshift(current.parentId);
    current = nodes.get(current.parentId);
  }
  return ancestors;
}
