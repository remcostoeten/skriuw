import type { RefObject } from "react";

export type TreeRef = RefObject<HTMLDivElement | null>;

export function rowElementFor(treeRef: TreeRef, id: string): HTMLElement | null {
  return treeRef.current?.querySelector<HTMLElement>(`[data-row-key="${id}"]`) ?? null;
}

function focusRenderedRow(treeRef: TreeRef, id: string): boolean {
  const tree = treeRef.current;
  const item = tree?.querySelector<HTMLButtonElement>(`[data-row-key="${CSS.escape(id)}"]`);
  if (!tree || !item) {
    return false;
  }
  item.focus({ preventScroll: true });
  const itemRect = item.getBoundingClientRect();
  const treeRect = tree.getBoundingClientRect();
  if (itemRect.top < treeRect.top || itemRect.bottom > treeRect.bottom) {
    item.scrollIntoView({ block: "nearest" });
  }
  return true;
}

export function focusTreeItem(treeRef: TreeRef, id: string | null, attempts = 0): void {
  if (!id) {
    return;
  }
  if (attempts === 0 && focusRenderedRow(treeRef, id)) {
    return;
  }
  requestAnimationFrame(() => {
    if (!focusRenderedRow(treeRef, id) && attempts < 1) {
      focusTreeItem(treeRef, id, attempts + 1);
    }
  });
}

export function openRowContextMenu(treeRef: TreeRef, id: string): void {
  const rowEl = treeRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(id)}"]`);
  if (!rowEl) {
    return;
  }
  const rect = rowEl.getBoundingClientRect();
  rowEl.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 24,
      clientY: rect.bottom,
    }),
  );
}
