import {
  dropZoneForOffset,
  isValidDrop,
  rowIndexAt,
  type DropTarget,
} from "@skriuw/renderer-core/store/tree-drop";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import type { SharedValue } from "react-native-reanimated";
import { TREE_ROW_HEIGHT } from "./metrics";

export const DRAG_SLOP_PX = 8;
export const EDGE_SCROLL_ZONE_PX = 56;
export const EDGE_SCROLL_STEP_PX = 9;
export const NO_HOVER_BAND = -1_000_000;
const BANDS_PER_ROW = 4;

export type DragOutcome = "menu" | "drop" | "cancel";

export type TreeDragValues = {
  draggedId: SharedValue<string | null>;
  fingerY: SharedValue<number>;
  moved: SharedValue<boolean>;
};

/**
 * @name dropTargetAtOffset
 * @description The drop a drag resting `contentY` points down the tree would
 * make, on the desktop sidebar's rules: a folder's middle half takes the node
 * in, the rest of a row is before or after it, and below the last row is the
 * top level. Returns `null` above the list, over the dragged row itself, and
 * where the drop would put a folder inside its own subtree.
 *
 * @example
 * const target = dropTargetAtOffset(store.getState(), "note-1", 190);
 */
export function dropTargetAtOffset(
  state: RendererState,
  draggedId: string,
  contentY: number,
): DropTarget | null {
  const index = rowIndexAt(contentY, TREE_ROW_HEIGHT, state.visibleIds.length);
  if (index === null) {
    return null;
  }
  if (index === "root-gap") {
    return { kind: "root-gap" };
  }
  const id = state.visibleIds[index];
  const node = id === undefined ? undefined : state.nodes.get(id);
  if (id === undefined || node === undefined || id === draggedId) {
    return null;
  }
  const zone = dropZoneForOffset(
    contentY - index * TREE_ROW_HEIGHT,
    TREE_ROW_HEIGHT,
    node.kind === "folder",
  );
  const target: DropTarget = { kind: "row", id, zone };
  return isValidDrop(state.nodes, [draggedId], target) ? target : null;
}

/**
 * @name hoverExpands
 * @description The collapsed folder a drag opens when it rests on `target`,
 * or `null` when the target is not the inside of a closed folder.
 *
 * @example
 * const folderId = hoverExpands(store.getState(), target);
 */
export function hoverExpands(state: RendererState, target: DropTarget | null): string | null {
  if (target === null || target.kind !== "row" || target.zone !== "inside") {
    return null;
  }
  return state.expandedIds.has(target.id) ? null : target.id;
}

/**
 * @name hoverBand
 * @description The quarter-row band a drag rests in, counted from the top of
 * the tree. Drop zones only change at band edges, so the list reports a hover
 * when this number changes and not on every frame.
 *
 * @example
 * if (hoverBand(contentY) !== band.get()) scheduleOnRN(onHover, contentY);
 */
export function hoverBand(contentY: number): number {
  "worklet";
  return Math.floor((contentY / TREE_ROW_HEIGHT) * BANDS_PER_ROW);
}

/**
 * @name edgeScrollStep
 * @description How far the list scrolls this frame while a drag rests at `y`
 * inside a list `height` tall: upward near the top edge, downward near the
 * bottom, nothing in between.
 *
 * @example
 * scrollTo(listRef, 0, offset + edgeScrollStep(y, height), false);
 */
export function edgeScrollStep(y: number, height: number): number {
  "worklet";
  if (y < EDGE_SCROLL_ZONE_PX) {
    return -EDGE_SCROLL_STEP_PX;
  }
  return y > height - EDGE_SCROLL_ZONE_PX ? EDGE_SCROLL_STEP_PX : 0;
}
