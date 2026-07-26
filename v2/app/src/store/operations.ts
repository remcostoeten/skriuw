import type {
  NodePlacement,
  WorkspaceNode,
  WorkspaceOperation,
} from "../contracts/workspace";
import { unavailableNodeIds } from "./tree";

const RANK_STEP = 1024;

function orderedSiblings(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  parentId: string | null,
  excludeId?: string,
): WorkspaceNode[] {
  const siblings: WorkspaceNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId === parentId && node.deletedAt === null && node.id !== excludeId) {
      siblings.push(node);
    }
  }
  siblings.sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    return left.id < right.id ? -1 : 1;
  });
  return siblings;
}

/**
 * Computes a provisional client-side rank for an optimistic placement. The
 * backend allocates the durable rank; the acknowledgement's rank changes
 * replace every provisional value.
 */
export function provisionalRank(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  placement: NodePlacement,
  movedId?: string,
): number {
  const siblings = orderedSiblings(nodes, placement.parentId, movedId);
  const position = placement.position;
  if (siblings.length === 0) {
    return RANK_STEP;
  }
  if (position.type === "first") {
    return (siblings[0]?.rank ?? RANK_STEP) - RANK_STEP;
  }
  if (position.type === "last") {
    return (siblings[siblings.length - 1]?.rank ?? 0) + RANK_STEP;
  }
  const anchorIndex = siblings.findIndex((node) => node.id === position.anchorId);
  if (anchorIndex === -1) {
    return (siblings[siblings.length - 1]?.rank ?? 0) + RANK_STEP;
  }
  const anchor = siblings[anchorIndex];
  const neighbor =
    position.type === "before" ? siblings[anchorIndex - 1] : siblings[anchorIndex + 1];
  if (!anchor) {
    return RANK_STEP;
  }
  if (!neighbor) {
    return position.type === "before" ? anchor.rank - RANK_STEP : anchor.rank + RANK_STEP;
  }
  return (anchor.rank + neighbor.rank) / 2;
}

/**
 * Applies an operation's local effect to the canonical node map, mirroring
 * backend semantics closely enough that the acknowledgement only has to
 * correct ranks and revisions.
 */
export function reduceOperation(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  operation: WorkspaceOperation,
): ReadonlyMap<string, WorkspaceNode> {
  switch (operation.type) {
    case "create_tag":
    case "rename_tag":
    case "recolor_tag":
    case "delete_tag":
    case "create_person":
    case "rename_person":
    case "recolor_person":
    case "delete_person":
    case "set_note_property":
    case "remove_note_property":
    case "reorder_note_properties":
    case "set_note_property_template":
    case "delete_note_property_template":
    case "reorder_note_property_templates":
    case "record_provider_import":
      return nodes;
    case "create_folder":
    case "create_note": {
      const next = new Map(nodes);
      next.set(operation.id, {
        id: operation.id,
        kind: operation.type === "create_folder" ? "folder" : "note",
        parentId: operation.placement.parentId,
        rank: provisionalRank(nodes, operation.placement),
        title: operation.title,
        icon: null,
        createdAt: operation.at,
        updatedAt: operation.at,
        deletedAt: null,
        pinnedAt: null,
      });
      return next;
    }
    case "rename_node": {
      const existing = nodes.get(operation.id);
      if (!existing) {
        return nodes;
      }
      const next = new Map(nodes);
      next.set(operation.id, { ...existing, title: operation.title, updatedAt: operation.at });
      return next;
    }
    case "move_node": {
      const existing = nodes.get(operation.id);
      if (!existing) {
        return nodes;
      }
      const next = new Map(nodes);
      next.set(operation.id, {
        ...existing,
        parentId: operation.placement.parentId,
        rank: provisionalRank(nodes, operation.placement, operation.id),
        updatedAt: operation.at,
      });
      return next;
    }
    case "set_node_pinned": {
      const existing = nodes.get(operation.id);
      if (!existing || existing.deletedAt !== null) {
        return nodes;
      }
      const pinnedAt = operation.pinned ? operation.at : null;
      if (existing.pinnedAt === pinnedAt) {
        return nodes;
      }
      const next = new Map(nodes);
      next.set(operation.id, { ...existing, pinnedAt, updatedAt: operation.at });
      return next;
    }
    case "trash_subtree": {
      const existing = nodes.get(operation.rootId);
      if (!existing || existing.deletedAt !== null) {
        return nodes;
      }
      const next = new Map(nodes);
      next.set(operation.rootId, { ...existing, deletedAt: operation.at });
      return next;
    }
    case "restore_subtree": {
      const existing = nodes.get(operation.rootId);
      if (!existing || existing.deletedAt === null) {
        return nodes;
      }
      const next = new Map(nodes);
      next.set(operation.rootId, {
        ...existing,
        deletedAt: null,
        parentId: operation.placement.parentId,
        rank: provisionalRank(nodes, operation.placement),
        updatedAt: operation.at,
      });
      return next;
    }
    case "purge_subtree": {
      const unavailable = unavailableNodeIds([...nodes.values()]);
      if (!unavailable.has(operation.rootId)) {
        return nodes;
      }
      const removed = new Set<string>([operation.rootId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const node of nodes.values()) {
          if (node.parentId && removed.has(node.parentId) && !removed.has(node.id)) {
            removed.add(node.id);
            grew = true;
          }
        }
      }
      const next = new Map(nodes);
      for (const id of removed) {
        next.delete(id);
      }
      return next;
    }
    case "save_document":
    case "set_active_note":
    case "update_settings":
    case "attach_image":
      return nodes;
  }
}
