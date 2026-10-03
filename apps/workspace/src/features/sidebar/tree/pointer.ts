import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { useDragSession } from "../drag/session";
import type { DropTarget } from "../drag/rules";
import { useRowGestures, type RowGestures } from "../touch/row-gestures";
import type { TreeRef } from "./focus";

export type TreePointerHandlers = {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onClickCapture: (event: MouseEvent) => void;
};

export type TreePointer = {
  dropTarget: DropTarget | null;
  handlers: TreePointerHandlers;
  touch: RowGestures;
};

export function useTreePointer(
  store: RendererStore,
  treeRef: TreeRef,
  rowPitch: number,
  onSwipeDelete: (id: string) => void,
): TreePointer {
  const suppressClickRef = useRef(false);
  const drag = useDragSession(store, treeRef, rowPitch, suppressClickRef);
  const touch = useRowGestures(treeRef, suppressClickRef, onSwipeDelete);

  return {
    dropTarget: drag.dropTarget,
    touch,
    handlers: {
      onPointerDown: (event) => {
        drag.cancelPending();
        if (event.button !== 0) {
          return;
        }
        const rowEl = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]");
        const id = rowEl?.getAttribute("data-row-key");
        if (!id || !rowEl) {
          return;
        }
        // Touch reserves hold for the menu and pull for delete, so drag reordering stays pointer-only.
        if (event.pointerType === "touch") {
          touch.begin(id, rowEl, event.clientX, event.clientY);
          return;
        }
        drag.arm(event.pointerId, event.clientX, event.clientY, id);
      },
      onPointerMove: (event) => {
        if (event.pointerType === "touch") {
          touch.move(event.clientX, event.clientY);
          return;
        }
        drag.onPointerMove(event);
      },
      onPointerUp: (event) => {
        if (event.pointerType === "touch") {
          touch.end(true);
          return;
        }
        drag.onPointerUp(event);
      },
      onPointerCancel: (event) => {
        if (event.pointerType === "touch") {
          touch.end(false);
          return;
        }
        drag.onPointerCancel(event);
      },
      onClickCapture: (event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      },
    },
  };
}
