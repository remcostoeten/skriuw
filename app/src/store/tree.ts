import type { WorkspaceNode } from "@/contracts/workspace";
import { JOURNAL_ROOT_ID } from "@/features/journal/constants";
import type { NodeRecord, RendererState } from "./types";

/**
 * Nodes whose own or inherited ancestor trash marker removes them from every
 * renderer surface, mirroring `WorkspaceSnapshot::unavailable_node_ids`.
 */
export function unavailableNodeIds(nodes: readonly WorkspaceNode[]): Set<string> {
  const children = new Map<string, string[]>();
  const pending: string[] = [];
  for (const node of nodes) {
    if (node.parentId !== null) {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node.id);
      children.set(node.parentId, siblings);
    }
    if (node.deletedAt !== null) {
      pending.push(node.id);
    }
  }
  const unavailable = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || unavailable.has(id)) {
      continue;
    }
    unavailable.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return unavailable;
}

/**
 * Sibling grouping applied before rank: folders sit above notes, and
 * dot-prefixed titles sink below both so hidden entries never lead a level.
 */
function siblingGroup(node: Pick<WorkspaceNode, "kind" | "title">): number {
  const hidden = node.title.startsWith(".");
  if (node.kind === "folder") {
    return hidden ? 2 : 0;
  }
  return hidden ? 3 : 1;
}

/**
 * Orders available nodes parents-first with siblings sorted by
 * (folders-before-notes, rank, id), matching backend-owned ordering across
 * desktop and web adapters.
 */
export function orderAvailableNodes(nodes: readonly WorkspaceNode[]): WorkspaceNode[] {
  const unavailable = unavailableNodeIds(nodes);
  const byParent = new Map<string | null, WorkspaceNode[]>();
  for (const node of nodes) {
    if (unavailable.has(node.id)) {
      continue;
    }
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => {
      const leftGroup = siblingGroup(left);
      const rightGroup = siblingGroup(right);
      if (leftGroup !== rightGroup) {
        return leftGroup - rightGroup;
      }
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return left.id < right.id ? -1 : 1;
    });
  }
  const ordered: WorkspaceNode[] = [];
  const stack = [...(byParent.get(null) ?? [])].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      break;
    }
    ordered.push(node);
    const childNodes = byParent.get(node.id) ?? [];
    for (let position = childNodes.length - 1; position >= 0; position -= 1) {
      const child = childNodes[position];
      if (child) {
        stack.push(child);
      }
    }
  }
  return ordered;
}

/**
 * Pinned, available nodes ordered most-recently-pinned-first. Trashed nodes
 * never appear pinned even while their `pinnedAt` column still holds a value.
 */
export function pinnedNodeIds(nodes: readonly WorkspaceNode[]): string[] {
  const unavailable = unavailableNodeIds(nodes);
  return nodes
    .filter((node) => node.pinnedAt != null && !unavailable.has(node.id))
    .sort((left, right) => {
      if (left.pinnedAt !== right.pinnedAt) {
        return (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0);
      }
      return left.id < right.id ? -1 : 1;
    })
    .map((node) => node.id);
}

export function buildNodeIndex(
  ordered: readonly Pick<WorkspaceNode, "id" | "parentId" | "kind" | "title">[],
): Pick<RendererState, "nodes" | "childrenByParent" | "nodeOrder"> {
  const byId = new Map<string, NodeRecord>();
  const children = new Map<string | null, string[]>();
  const order: string[] = [];

  for (const projected of ordered) {
    const parent = projected.parentId === null ? null : byId.get(projected.parentId);
    const siblings = children.get(projected.parentId) ?? [];
    const node: NodeRecord = {
      id: projected.id,
      parentId: projected.parentId,
      kind: projected.kind,
      title: projected.title,
      depth: parent ? parent.depth + 1 : 1,
      setSize: 0,
      posInSet: siblings.length + 1,
      descendantCount: 0,
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
  for (let position = order.length - 1; position >= 0; position -= 1) {
    const node = byId.get(order[position] ?? "");
    if (!node || node.parentId === null) {
      continue;
    }
    const parent = byId.get(node.parentId);
    if (parent) {
      parent.descendantCount += node.descendantCount + 1;
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
    // The journal's hidden folder and its entries never surface in the tree.
    if (id === JOURNAL_ROOT_ID) {
      continue;
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

export function visibleTreeRange(
  visibleIds: readonly string[],
  anchorId: string,
  targetId: string,
): Set<string> {
  const anchorIndex = visibleIds.indexOf(anchorId);
  const targetIndex = visibleIds.indexOf(targetId);
  if (anchorIndex < 0 || targetIndex < 0) {
    return new Set([targetId]);
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return new Set(visibleIds.slice(start, end + 1));
}

export function selectedTreeRoots(
  selectedIds: ReadonlySet<string>,
  nodes: ReadonlyMap<string, NodeRecord>,
): string[] {
  return [...selectedIds].filter(
    (id) => !ancestorIds(nodes, id).some((ancestorId) => selectedIds.has(ancestorId)),
  );
}

export type VirtualTreeWindow = {
  start: number;
  end: number;
  offset: number;
  totalHeight: number;
};

export function visualTreeIndent(
  depth: number,
  basePadding: number,
  depthIndent: number,
  maximumIndent: number,
): number {
  return Math.min(
    basePadding + Math.max(0, depth - 1) * depthIndent,
    maximumIndent,
  );
}

export function virtualTreeWindow(
  rowCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowPitch: number,
  overscan = 8,
  maximumRows = 40,
): VirtualTreeWindow {
  if (rowCount === 0 || rowPitch <= 0) {
    return { start: 0, end: 0, offset: 0, totalHeight: 0 };
  }
  const visibleRows = Math.max(1, Math.ceil(viewportHeight / rowPitch));
  const windowRows = Math.min(maximumRows, visibleRows + overscan * 2, rowCount);
  const firstVisible = Math.max(0, Math.floor(scrollTop / rowPitch));
  const leadingOverscan = Math.min(overscan, Math.max(0, windowRows - visibleRows));
  const start = Math.min(
    Math.max(0, firstVisible - leadingOverscan),
    Math.max(0, rowCount - windowRows),
  );
  const end = Math.min(rowCount, start + windowRows);
  return {
    start,
    end,
    offset: start * rowPitch,
    totalHeight: rowCount * rowPitch,
  };
}
