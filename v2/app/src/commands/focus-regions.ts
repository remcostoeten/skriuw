export type FocusRegion = "sidebar" | "editor" | "metadata";

const REGION_SELECTORS: Record<FocusRegion, string> = {
  sidebar: '[role="tree"][aria-label="Workspace"]',
  editor: ".prosemirror-host .ProseMirror",
  metadata: 'aside[aria-label="Note metadata"]',
};

export function focusRegion(region: FocusRegion): boolean {
  const element = document.querySelector<HTMLElement>(REGION_SELECTORS[region]);
  if (!element) {
    return false;
  }
  if (!element.hasAttribute("tabindex") && !element.isContentEditable) {
    element.tabIndex = -1;
  }
  element.focus();
  return document.activeElement === element;
}
