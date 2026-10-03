import { useRef } from "react";
import type { RefObject } from "react";
import { haptic } from "@/shared/touch/haptics";
import { swallowGhostClick } from "@/shared/touch/ghost-click";
import { rowElementFor, type TreeRef } from "../tree/focus";
import {
  LONG_PRESS_MS,
  beginRowGesture,
  moveRowGesture,
  releaseIsTap,
  swipeDeletes,
  type RowGesture,
} from "./gestures";

export type RowGestures = {
  begin: (id: string, rowEl: HTMLElement, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: (commit: boolean) => void;
  reset: () => void;
  afterMenuClose: () => void;
};

export function useRowGestures(
  treeRef: TreeRef,
  suppressClickRef: RefObject<boolean>,
  onSwipeDelete: (id: string) => void,
): RowGestures {
  const touchGestureRef = useRef<RowGesture>({ kind: "idle" });
  const longPressRef = useRef<number | null>(null);
  const touchMenuRef = useRef(false);

  function clearLongPress(): void {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  function settleSwipedRow(id: string): void {
    const rowEl = rowElementFor(treeRef, id);
    if (!rowEl) {
      return;
    }
    rowEl.classList.add("sidebar-tree-row-settle");
    rowEl.style.transform = "";
    delete rowEl.dataset.swipe;
    window.setTimeout(() => rowEl.classList.remove("sidebar-tree-row-settle"), 200);
  }

  // iOS never synthesises `contextmenu` on a long press, so the timer dispatches it; Android's native event cancels the timer.
  function begin(id: string, rowEl: HTMLElement, x: number, y: number): void {
    clearLongPress();
    touchGestureRef.current = beginRowGesture(id, x, y);
    longPressRef.current = window.setTimeout(() => {
      longPressRef.current = null;
      if (touchGestureRef.current.kind !== "pending") {
        return;
      }
      touchGestureRef.current = { kind: "cancelled" };
      suppressClickRef.current = true;
      touchMenuRef.current = true;
      haptic("select");
      rowEl.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }),
      );
    }, LONG_PRESS_MS);
  }

  function move(x: number, y: number): void {
    const previous = touchGestureRef.current;
    const next = moveRowGesture(previous, x, y);
    touchGestureRef.current = next;
    if (next === previous) {
      return;
    }
    if (next.kind !== "pending") {
      clearLongPress();
    }
    if (next.kind === "swipe") {
      const rowEl = rowElementFor(treeRef, next.rowId);
      if (rowEl) {
        rowEl.style.transform = `translateX(${next.offset}px)`;
        const deletes = swipeDeletes(next);
        if (deletes && rowEl.dataset.swipe !== "delete") {
          haptic("warn");
        }
        rowEl.dataset.swipe = deletes ? "delete" : "true";
      }
    }
  }

  function end(commit: boolean): void {
    clearLongPress();
    const gesture = touchGestureRef.current;
    touchGestureRef.current = { kind: "idle" };
    if (gesture.kind === "swipe") {
      suppressClickRef.current = true;
      settleSwipedRow(gesture.rowId);
      if (commit && swipeDeletes(gesture)) {
        haptic("confirm");
        onSwipeDelete(gesture.rowId);
      }
      return;
    }
    if (!releaseIsTap(gesture) && gesture.kind !== "idle") {
      suppressClickRef.current = gesture.kind === "cancelled" && suppressClickRef.current;
    }
  }

  return {
    begin,
    move,
    end,
    reset: () => {
      clearLongPress();
      touchGestureRef.current = { kind: "idle" };
    },
    afterMenuClose: () => {
      if (touchMenuRef.current) {
        touchMenuRef.current = false;
        swallowGhostClick();
      }
    },
  };
}
