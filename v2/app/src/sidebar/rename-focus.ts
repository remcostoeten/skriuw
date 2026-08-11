let returnTarget: HTMLElement | null = null;

/**
 * Remembers where keyboard focus sits so an inline rename started from outside
 * the sidebar (the editor's `renameCurrentNote` shortcut) can hand focus back
 * when the rename commits or is cancelled. Renames started inside the tree
 * never capture, so the tree keeps its own focus behaviour.
 */
export function captureRenameReturnFocus(): void {
  if (typeof document === "undefined") {
    return;
  }
  const active = document.activeElement;
  returnTarget = active instanceof HTMLElement ? active : null;
}

export function restoreRenameReturnFocus(): void {
  const target = returnTarget;
  returnTarget = null;
  if (target === null) {
    return;
  }
  requestAnimationFrame(() => {
    if (target.isConnected) {
      target.focus();
    }
  });
}
