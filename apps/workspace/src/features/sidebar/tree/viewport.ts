import { useEffect, useMemo, useState } from "react";
import type { UIEvent } from "react";
import { virtualTreeWindow } from "@skriuw/renderer-core/store/tree";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { TreeRef } from "./focus";

const TREE_OVERSCAN_ROWS = 3;
const MAX_RENDERED_TREE_ROWS = 80;

export type TreeWindow = ReturnType<typeof virtualTreeWindow>;

export type TreeViewport = {
  rowPitch: number;
  treeWindow: TreeWindow;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
};

export function useTreeViewport(
  store: RendererStore,
  treeRef: TreeRef,
  rowHeight: number,
  visibleCount: number,
  isSearchOpen: boolean,
): TreeViewport {
  const [treeScrollRow, setTreeScrollRow] = useState(0);
  const [treeViewportHeight, setTreeViewportHeight] = useState(0);
  const rowPitch = rowHeight + 1;

  useEffect(() => {
    function revealFocusedNode() {
      const element = treeRef.current;
      const state = store.getState();
      const focusedId = state.focusedNodeId;
      const index = focusedId ? state.visibleIds.indexOf(focusedId) : -1;
      element?.removeAttribute("aria-activedescendant");
      if (!element || index < 0 || focusedId === null) {
        return;
      }
      const pitch = rowHeight + 1;
      const top = index * pitch;
      const bottom = top + pitch;
      let nextScrollTop = element.scrollTop;
      if (top < element.scrollTop) {
        nextScrollTop = top;
      } else if (bottom > element.scrollTop + element.clientHeight) {
        nextScrollTop = bottom - element.clientHeight;
      }
      if (nextScrollTop !== element.scrollTop) {
        element.scrollTop = nextScrollTop;
        setTreeScrollRow(Math.floor(nextScrollTop / pitch));
      }
    }
    revealFocusedNode();
    return store.subscribe((state) => state.focusedNodeId, revealFocusedNode);
  }, [rowHeight, isSearchOpen, store]);

  useEffect(() => {
    const element = treeRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height !== undefined) {
        setTreeViewportHeight(height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isSearchOpen]);

  const treeWindow = useMemo(
    () =>
      virtualTreeWindow(
        visibleCount,
        treeScrollRow * rowPitch,
        Math.max(rowPitch, treeViewportHeight),
        rowPitch,
        TREE_OVERSCAN_ROWS,
        MAX_RENDERED_TREE_ROWS,
      ),
    [rowPitch, treeScrollRow, treeViewportHeight, visibleCount],
  );

  return {
    rowPitch,
    treeWindow,
    onScroll: (event) => setTreeScrollRow(Math.floor(event.currentTarget.scrollTop / rowPitch)),
  };
}
