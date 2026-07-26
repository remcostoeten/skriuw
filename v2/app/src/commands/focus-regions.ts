export type FocusRegion = "sidebar" | "editor" | "metadata";

export const SIDEBAR_TREE_SELECTOR = '[role="tree"][aria-label="Workspace"]';

const EDITOR_PANE_SELECTOR = ".editor-pane";

const EDITOR_CONTENT_SELECTOR = ".prosemirror-host .ProseMirror";

const REGION_SELECTORS: Record<FocusRegion, string> = {
  sidebar: SIDEBAR_TREE_SELECTOR,
  editor: EDITOR_CONTENT_SELECTOR,
  metadata: 'aside[aria-label="Note metadata"]',
};

function focusElement(element: HTMLElement | null): boolean {
  if (!element) {
    return false;
  }
  if (!element.hasAttribute("tabindex") && !element.isContentEditable) {
    element.tabIndex = -1;
  }
  element.focus();
  return document.activeElement === element;
}

export function focusRegion(region: FocusRegion): boolean {
  return focusElement(document.querySelector<HTMLElement>(REGION_SELECTORS[region]));
}

/**
 * Which pane the keyboard is inside, by on-screen order, or null when focus
 * sits outside every pane — the sidebar, the metadata panel, or the icon rail.
 */
export function focusedPaneIndex(): number | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return null;
  }
  const pane = active.closest(EDITOR_PANE_SELECTOR);
  if (pane === null) {
    return null;
  }
  const index = [...document.querySelectorAll(EDITOR_PANE_SELECTOR)].indexOf(pane);
  return index < 0 ? null : index;
}

/** Focuses the editor content of the pane at `index` in on-screen order. */
export function focusEditorPane(index: number): boolean {
  const pane = document.querySelectorAll<HTMLElement>(EDITOR_PANE_SELECTOR)[index];
  return focusElement(pane?.querySelector<HTMLElement>(EDITOR_CONTENT_SELECTOR) ?? null);
}
