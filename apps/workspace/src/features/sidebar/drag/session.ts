import { useEffect, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";
import { noop } from "@skriuw/shared/helpers/noop";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { TreeRef } from "../tree/focus";
import { moveNodes } from "../tree/operations";
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_STEP_PX,
  DRAG_THRESHOLD_PX,
  HOVER_EXPAND_DELAY_MS,
  autoScrollStep,
  dragRoots,
  dropMoves,
  dropZoneForOffset,
  isValidDrop,
  rowIndexAt,
  sameDropTarget,
  type DropTarget,
} from "./rules";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  sourceId: string;
  active: boolean;
  dragIds: string[];
  target: DropTarget | null;
  keyListener: ((event: KeyboardEvent) => void) | null;
};

export type DragSession = {
  dropTarget: DropTarget | null;
  arm: (pointerId: number, clientX: number, clientY: number, sourceId: string) => void;
  cancelPending: () => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
};

export function useDragSession(
  store: RendererStore,
  treeRef: TreeRef,
  rowPitch: number,
  suppressClickRef: RefObject<boolean>,
): DragSession {
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const hoverExpandRef = useRef<number | null>(null);
  const autoScrollRef = useRef<{ raf: number; pointerX: number; pointerY: number } | null>(null);

  function clearHoverExpand(): void {
    if (hoverExpandRef.current !== null) {
      window.clearTimeout(hoverExpandRef.current);
      hoverExpandRef.current = null;
    }
  }

  function stopAutoScroll(): void {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current.raf);
      autoScrollRef.current = null;
    }
  }

  function scheduleHoverExpand(target: DropTarget | null): void {
    clearHoverExpand();
    if (target?.kind !== "row" || target.zone !== "inside") {
      return;
    }
    const state = store.getState();
    const node = state.nodes.get(target.id);
    if (node?.kind !== "folder" || state.expandedIds.has(target.id)) {
      return;
    }
    hoverExpandRef.current = window.setTimeout(() => {
      hoverExpandRef.current = null;
      if (dragRef.current?.active === true && !store.getState().expandedIds.has(target.id)) {
        store.toggleExpanded(target.id);
      }
    }, HOVER_EXPAND_DELAY_MS);
  }

  function setDropTargetIfChanged(next: DropTarget | null): void {
    const session = dragRef.current;
    if (!session || sameDropTarget(session.target, next)) {
      return;
    }
    session.target = next;
    setDropTarget(next);
    scheduleHoverExpand(next);
  }

  function updateDropTarget(clientX: number, clientY: number): void {
    const session = dragRef.current;
    const element = treeRef.current;
    if (session?.active !== true || !element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right) {
      setDropTargetIfChanged(null);
      return;
    }
    const state = store.getState();
    const contentY = clientY - rect.top + element.scrollTop;
    const index = rowIndexAt(contentY, rowPitch, state.visibleIds.length);
    let next: DropTarget | null = null;
    if (index === "root-gap") {
      next = { kind: "root-gap" };
    } else if (index !== null) {
      const id = state.visibleIds[index];
      const node = id === undefined ? undefined : state.nodes.get(id);
      if (id !== undefined && node) {
        const zone = dropZoneForOffset(
          contentY - index * rowPitch,
          rowPitch,
          node.kind === "folder",
        );
        next = { kind: "row", id, zone };
      }
    }
    if (next && !isValidDrop(state.nodes, session.dragIds, next)) {
      next = null;
    }
    setDropTargetIfChanged(next);
  }

  function updateAutoScroll(clientX: number, clientY: number): void {
    const element = treeRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const step = autoScrollStep(
      clientY,
      rect.top,
      rect.bottom,
      AUTO_SCROLL_EDGE_PX,
      AUTO_SCROLL_MAX_STEP_PX,
    );
    if (step === 0) {
      stopAutoScroll();
      return;
    }
    if (autoScrollRef.current !== null) {
      autoScrollRef.current.pointerX = clientX;
      autoScrollRef.current.pointerY = clientY;
      return;
    }
    function tick() {
      const current = autoScrollRef.current;
      const tree = treeRef.current;
      if (!current || !tree || dragRef.current?.active !== true) {
        stopAutoScroll();
        return;
      }
      const bounds = tree.getBoundingClientRect();
      const frameStep = autoScrollStep(
        current.pointerY,
        bounds.top,
        bounds.bottom,
        AUTO_SCROLL_EDGE_PX,
        AUTO_SCROLL_MAX_STEP_PX,
      );
      if (frameStep === 0) {
        stopAutoScroll();
        return;
      }
      tree.scrollTop += frameStep;
      updateDropTarget(current.pointerX, current.pointerY);
      current.raf = requestAnimationFrame(tick);
    }
    autoScrollRef.current = {
      raf: requestAnimationFrame(tick),
      pointerX: clientX,
      pointerY: clientY,
    };
  }

  function beginDrag(session: DragState): void {
    const state = store.getState();
    const selected = state.selectedNodeIds.has(session.sourceId)
      ? state.nodeOrder.filter((id) => state.selectedNodeIds.has(id))
      : [session.sourceId];
    session.dragIds = dragRoots(selected, state.nodes);
    session.active = true;
    session.keyListener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        endDrag(false);
      }
    };
    window.addEventListener("keydown", session.keyListener, true);
    try {
      treeRef.current?.setPointerCapture(session.pointerId);
    } catch {
      // WebKitGTK can refuse capture for a pointer that already left the window; container events still drive the drag.
      noop();
    }
    treeRef.current?.classList.add("sidebar-tree-dragging");
  }

  function endDrag(commit: boolean): void {
    const session = dragRef.current;
    dragRef.current = null;
    clearHoverExpand();
    stopAutoScroll();
    if (!session?.active) {
      return;
    }
    if (session.keyListener) {
      window.removeEventListener("keydown", session.keyListener, true);
    }
    const tree = treeRef.current;
    tree?.classList.remove("sidebar-tree-dragging");
    if (tree?.hasPointerCapture(session.pointerId) === true) {
      tree.releasePointerCapture(session.pointerId);
    }
    suppressClickRef.current = true;
    setDropTarget(null);
    if (commit && session.target !== null) {
      moveNodes(store, dropMoves(store.getState().nodes, session.dragIds, session.target));
    }
  }

  useEffect(() => () => endDrag(false), []);

  return {
    dropTarget,
    arm: (pointerId, clientX, clientY, sourceId) => {
      dragRef.current = {
        pointerId,
        startX: clientX,
        startY: clientY,
        sourceId,
        active: false,
        dragIds: [],
        target: null,
        keyListener: null,
      };
    },
    cancelPending: () => {
      if (dragRef.current !== null) {
        endDrag(false);
      }
    },
    onPointerMove: (event) => {
      const session = dragRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      if (!session.active) {
        const deltaX = event.clientX - session.startX;
        const deltaY = event.clientY - session.startY;
        if (deltaX * deltaX + deltaY * deltaY < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          return;
        }
        beginDrag(session);
      }
      updateDropTarget(event.clientX, event.clientY);
      updateAutoScroll(event.clientX, event.clientY);
    },
    onPointerUp: (event) => {
      const session = dragRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      endDrag(true);
    },
    onPointerCancel: (event) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        endDrag(false);
      }
    },
  };
}
