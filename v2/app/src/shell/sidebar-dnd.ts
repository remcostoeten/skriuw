import type { NodePlacement } from "../contracts/workspace";
import { ancestorIds } from "../store/tree";
import type { NodeRecord } from "../store/types";

export type DropZone = "before" | "after" | "inside";

export type DropTarget = { kind: "row"; id: string; zone: DropZone } | { kind: "root-gap" };

export const DRAG_THRESHOLD_PX = 4;
export const HOVER_EXPAND_DELAY_MS = 700;
export const AUTO_SCROLL_EDGE_PX = 36;
export const AUTO_SCROLL_MAX_STEP_PX = 14;

/**
 * Reduces a drag selection to subtree roots: a node whose ancestor is also in
 * the set is dropped, because moving the ancestor already moves it.
 */
export function dragRoots(
  ids: readonly string[],
  nodes: ReadonlyMap<string, NodeRecord>,
): string[] {
  const idSet = new Set(ids);
  return ids.filter(
    (id) => !ancestorIds(nodes, id).some((ancestorId) => idSet.has(ancestorId)),
  );
}

export function isWithinSubtree(
  nodes: ReadonlyMap<string, NodeRecord>,
  nodeId: string,
  rootId: string,
): boolean {
  let currentId: string | null = nodeId;
  while (currentId !== null) {
    if (currentId === rootId) {
      return true;
    }
    currentId = nodes.get(currentId)?.parentId ?? null;
  }
  return false;
}

/**
 * Maps a y offset in tree content coordinates to the visible row index, the
 * root gap below the last row, or null above the list.
 */
export function rowIndexAt(
  contentY: number,
  rowPitch: number,
  rowCount: number,
): number | "root-gap" | null {
  if (contentY < 0 || rowPitch <= 0) {
    return null;
  }
  const index = Math.floor(contentY / rowPitch);
  return index >= rowCount ? "root-gap" : index;
}

/**
 * Splits a row into drop zones: folders get 25% before / 50% inside / 25%
 * after bands, notes split 50/50 into before and after.
 */
export function dropZoneForOffset(
  offsetY: number,
  rowPitch: number,
  isFolder: boolean,
): DropZone {
  const ratio = Math.min(Math.max(offsetY / rowPitch, 0), 1);
  if (!isFolder) {
    return ratio < 0.5 ? "before" : "after";
  }
  if (ratio < 0.25) {
    return "before";
  }
  if (ratio > 0.75) {
    return "after";
  }
  return "inside";
}

export function isValidDrop(
  nodes: ReadonlyMap<string, NodeRecord>,
  dragIds: readonly string[],
  target: DropTarget,
): boolean {
  if (dragIds.length === 0) {
    return false;
  }
  if (target.kind === "root-gap") {
    return true;
  }
  return dragIds.every((dragId) => !isWithinSubtree(nodes, target.id, dragId));
}

export function dropPlacement(
  nodes: ReadonlyMap<string, NodeRecord>,
  target: DropTarget,
): NodePlacement | null {
  if (target.kind === "root-gap") {
    return { parentId: null, position: { type: "last" } };
  }
  const node = nodes.get(target.id);
  if (!node) {
    return null;
  }
  if (target.zone === "inside") {
    return { parentId: target.id, position: { type: "last" } };
  }
  return { parentId: node.parentId, position: { type: target.zone, anchorId: target.id } };
}

/**
 * Builds one move per dragged root. "after" moves share the anchor, so they
 * are emitted in reverse visible order to keep the dragged rows in order once
 * each op lands after the same anchor.
 */
export function dropMoves(
  nodes: ReadonlyMap<string, NodeRecord>,
  dragIds: readonly string[],
  target: DropTarget,
): { id: string; placement: NodePlacement }[] {
  if (!isValidDrop(nodes, dragIds, target)) {
    return [];
  }
  const placement = dropPlacement(nodes, target);
  if (placement === null) {
    return [];
  }
  const ordered =
    placement.position.type === "after" ? [...dragIds].reverse() : [...dragIds];
  return ordered.map((id) => ({ id, placement }));
}

export function indicatorIndentDepth(
  nodes: ReadonlyMap<string, NodeRecord>,
  target: DropTarget,
): number {
  if (target.kind === "root-gap") {
    return 1;
  }
  return nodes.get(target.id)?.depth ?? 1;
}

export function sameDropTarget(left: DropTarget | null, right: DropTarget | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  if (left.kind === "root-gap" || right.kind === "root-gap") {
    return left.kind === right.kind;
  }
  return left.id === right.id && left.zone === right.zone;
}

/**
 * Scroll delta for one auto-scroll frame: zero outside the edge bands,
 * ramping linearly up to the maximum step at the viewport edge.
 */
export function autoScrollStep(
  pointerY: number,
  viewportTop: number,
  viewportBottom: number,
  edge = AUTO_SCROLL_EDGE_PX,
  maxStep = AUTO_SCROLL_MAX_STEP_PX,
): number {
  const fromTop = pointerY - viewportTop;
  const fromBottom = viewportBottom - pointerY;
  if (fromTop < edge) {
    return -Math.ceil(((edge - Math.max(fromTop, 0)) / edge) * maxStep);
  }
  if (fromBottom < edge) {
    return Math.ceil(((edge - Math.max(fromBottom, 0)) / edge) * maxStep);
  }
  return 0;
}
