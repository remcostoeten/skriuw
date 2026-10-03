import type { RefObject } from "react";

export type TreeRef = RefObject<HTMLDivElement | null>;

export function rowElementFor(treeRef: TreeRef, id: string): HTMLElement | null {
  return treeRef.current?.querySelector<HTMLElement>(`[data-row-key="${id}"]`) ?? null;
}

export function focusTreeItem(treeRef: TreeRef, id: string | null, attempts = 0): void {
  if (!id) {
    return;
  }
  requestAnimationFrame(() => {
    const item = treeRef.current?.querySelector<HTMLButtonElement>(
      `[data-row-key="${CSS.escape(id)}"]`,
    );
    if (item) {
      item.focus();
    } else if (attempts === 0) {
      focusTreeItem(treeRef, id, 1);
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
