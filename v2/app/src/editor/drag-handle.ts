import { NodeSelection, type Selection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { moveBlockToIndex, topLevelBlockAt } from "./block-commands";

const GUTTER_GAP = 10;
const GUTTER_HIT_ZONE = 56;
const DRAG_THRESHOLD = 4;
const AUTOSCROLL_ZONE = 64;
const AUTOSCROLL_MAX_SPEED = 20;

const PLUS_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

const GRIP_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

export type BlockMenuTarget = {
  pos: number;
  x: number;
  y: number;
};

export type DragHandleOptions = {
  scrollHost: HTMLElement | null;
  onInsert: (position: number) => void;
  onMenu: (target: BlockMenuTarget) => void;
};

export type DragHandleController = {
  isDragging: () => boolean;
  hide: () => void;
  destroy: () => void;
};

type ActiveDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  pos: number;
};

function buttonElement(label: string, icon: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "block-gutter-button";
  button.title = label;
  button.tabIndex = -1;
  button.setAttribute("aria-hidden", "true");
  button.innerHTML = icon;
  return button;
}

/**
 * The grip is a plain element rather than a `<button>`: form controls swallow
 * the pointerdown that begins the gesture. The whole gutter is hidden from the
 * accessibility tree because it is pointer-only; every action it offers exists
 * on a reachable path (slash menu, block context menu, Alt-Arrow).
 */
function gripElement(label: string): HTMLDivElement {
  const grip = document.createElement("div");
  grip.className = "block-gutter-button block-gutter-grip";
  grip.title = label;
  grip.setAttribute("aria-hidden", "true");
  grip.innerHTML = GRIP_ICON;
  return grip;
}

/**
 * Renders the hover gutter (insert + drag grip) beside the top-level block
 * under the pointer, and reorders blocks by dragging the grip.
 *
 * Reordering runs on pointer events rather than HTML5 drag-and-drop: dragging
 * page content is unreliable in WebKitGTK, which is the desktop webview, so the
 * native path never fires `dragstart` there. Pointer capture behaves the same
 * across WebKit, Chromium and touch, and keeps the drop entirely in our own
 * transaction.
 *
 * Hover tracking stays outside React on purpose: the handle follows the mouse,
 * so routing it through component state would re-render the editor subtree on
 * every move. Pointer moves are coalesced into one animation frame, and moves
 * that stay inside the already-measured block rect do no work at all.
 */
export function createDragHandle(
  view: EditorView,
  options: DragHandleOptions,
): DragHandleController {
  const gutter = document.createElement("div");
  gutter.className = "block-gutter";
  const insertButton = buttonElement("Insert block below", PLUS_ICON);
  const gripButton = gripElement("Drag to move, click for block actions");
  gutter.append(insertButton, gripButton);
  const indicator = document.createElement("div");
  indicator.className = "block-drop-indicator";
  const overlayHost = view.dom.parentElement ?? view.dom;
  overlayHost.append(gutter, indicator);

  let hoveredPos: number | null = null;
  let hoveredRect: DOMRect | null = null;
  let contentLeft = 0;
  let visible = false;
  let pointerX = 0;
  let pointerY = 0;
  let moveFrame = 0;
  let placement = "";
  let gutterWidth = 0;
  let gutterHeight = 0;

  let drag: ActiveDrag | null = null;
  let dragActive = false;
  let preDragSelection: ReturnType<Selection["getBookmark"]> | null = null;
  let dropIndex: number | null = null;
  let dragX = 0;
  let dragY = 0;
  let dragFrame = 0;
  let scrollSpeed = 0;
  let scrollFrame = 0;

  function hide(): void {
    hoveredPos = null;
    hoveredRect = null;
    if (!visible) return;
    visible = false;
    gutter.classList.remove("is-visible");
  }

  function withinHoveredBlock(x: number, y: number): boolean {
    const rect = hoveredRect;
    if (!rect) return false;
    return (
      y >= rect.top &&
      y <= rect.bottom &&
      x >= contentLeft - GUTTER_HIT_ZONE &&
      x <= rect.right
    );
  }

  function firstLineHeight(dom: HTMLElement, rect: DOMRect): number {
    const style = window.getComputedStyle(dom);
    const lineHeight = Number.parseFloat(style.lineHeight);
    if (Number.isFinite(lineHeight)) return Math.min(lineHeight, rect.height);
    const fontSize = Number.parseFloat(style.fontSize);
    const estimated = Number.isFinite(fontSize) ? fontSize * 1.5 : rect.height;
    return Math.min(estimated, rect.height);
  }

  function place(dom: HTMLElement, rect: DOMRect): void {
    if (gutterWidth === 0) {
      gutterWidth = gutter.offsetWidth;
      gutterHeight = gutter.offsetHeight;
    }
    const x = Math.round(rect.left - GUTTER_GAP - gutterWidth);
    const y = Math.round(rect.top + (firstLineHeight(dom, rect) - gutterHeight) / 2);
    const next = `translate3d(${x}px, ${y}px, 0)`;
    if (next !== placement) {
      placement = next;
      gutter.style.transform = next;
    }
    if (!visible) {
      visible = true;
      gutter.classList.add("is-visible");
    }
  }

  function blockAtPoint(x: number, y: number): { pos: number; dom: HTMLElement } | null {
    const contentRect = view.dom.getBoundingClientRect();
    contentLeft = contentRect.left;
    const probeX = Math.min(Math.max(x, contentRect.left + 1), contentRect.right - 1);
    const probeY = Math.min(Math.max(y, contentRect.top + 1), contentRect.bottom - 1);
    const found = view.posAtCoords({ left: probeX, top: probeY });
    if (!found) return null;
    const block = topLevelBlockAt(view.state.doc, found.pos);
    const dom = block ? view.nodeDOM(block.pos) : null;
    if (!block || !(dom instanceof HTMLElement)) return null;
    return { pos: block.pos, dom };
  }

  function update(): void {
    if (drag || !view.editable) {
      hide();
      return;
    }
    const contentRect = view.dom.getBoundingClientRect();
    if (pointerY < contentRect.top || pointerY > contentRect.bottom) {
      hide();
      return;
    }
    const target = blockAtPoint(pointerX, pointerY);
    if (!target) {
      hide();
      return;
    }
    hoveredPos = target.pos;
    hoveredRect = target.dom.getBoundingClientRect();
    place(target.dom, hoveredRect);
  }

  function handlePointerMove(event: MouseEvent): void {
    if (drag) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (withinHoveredBlock(pointerX, pointerY)) return;
    if (moveFrame !== 0) return;
    moveFrame = window.requestAnimationFrame(() => {
      moveFrame = 0;
      update();
    });
  }

  function handlePointerLeave(event: MouseEvent): void {
    if (drag) return;
    const next = event.relatedTarget;
    if (next instanceof HTMLElement && gutter.contains(next)) return;
    hide();
  }

  function stopAutoScroll(): void {
    scrollSpeed = 0;
    if (scrollFrame === 0) return;
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  }

  function stepAutoScroll(): void {
    const host = options.scrollHost;
    if (!dragActive || !host || scrollSpeed === 0) {
      scrollFrame = 0;
      return;
    }
    host.scrollTop += scrollSpeed;
    updateDropTarget();
    scrollFrame = scrollSpeed === 0 ? 0 : window.requestAnimationFrame(stepAutoScroll);
  }

  function syncAutoScroll(): void {
    const host = options.scrollHost;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const fromTop = dragY - rect.top;
    const fromBottom = rect.bottom - dragY;
    if (fromTop < AUTOSCROLL_ZONE) {
      scrollSpeed = -Math.min(AUTOSCROLL_MAX_SPEED, (AUTOSCROLL_ZONE - fromTop) / 3);
    } else if (fromBottom < AUTOSCROLL_ZONE) {
      scrollSpeed = Math.min(AUTOSCROLL_MAX_SPEED, (AUTOSCROLL_ZONE - fromBottom) / 3);
    } else {
      scrollSpeed = 0;
    }
    if (scrollSpeed !== 0 && scrollFrame === 0) {
      scrollFrame = window.requestAnimationFrame(stepAutoScroll);
    }
  }

  function updateDropTarget(): void {
    if (!dragActive) return;
    const target = blockAtPoint(dragX, dragY);
    if (!target) return;
    const rect = target.dom.getBoundingClientRect();
    const index = view.state.doc.resolve(target.pos).index(0);
    const below = dragY > rect.top + rect.height / 2;
    dropIndex = below ? index + 1 : index;
    const contentRect = view.dom.getBoundingClientRect();
    const y = Math.round(below ? rect.bottom : rect.top);
    indicator.style.transform = `translate3d(${Math.round(contentRect.left)}px, ${y}px, 0)`;
    indicator.style.width = `${Math.round(contentRect.width)}px`;
    syncAutoScroll();
  }

  function beginDrag(): void {
    if (!drag) return;
    dragActive = true;
    const block = topLevelBlockAt(view.state.doc, drag.pos);
    if (block) {
      preDragSelection = view.state.selection.getBookmark();
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, block.pos)));
    }
    hide();
    indicator.classList.add("is-visible");
    document.body.classList.add("is-dragging-block");
  }

  function endDrag(): void {
    if (drag && gripButton.hasPointerCapture(drag.pointerId)) {
      gripButton.releasePointerCapture(drag.pointerId);
    }
    drag = null;
    dragActive = false;
    dropIndex = null;
    preDragSelection = null;
    stopAutoScroll();
    if (dragFrame !== 0) {
      window.cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    }
    indicator.classList.remove("is-visible");
    document.body.classList.remove("is-dragging-block");
  }

  function cancelDrag(): void {
    const bookmark = preDragSelection;
    const restore = dragActive;
    preDragSelection = null;
    endDrag();
    if (restore && bookmark) {
      view.dispatch(view.state.tr.setSelection(bookmark.resolve(view.state.doc)));
    }
  }

  function openBlockMenu(position: number): void {
    const block = topLevelBlockAt(view.state.doc, position);
    if (!block) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, block.pos)));
    const rect = gripButton.getBoundingClientRect();
    options.onMenu({ pos: block.pos, x: rect.left, y: rect.bottom });
  }

  function handleGripPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || hoveredPos === null) return;
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pos: hoveredPos,
    };
    dragX = event.clientX;
    dragY = event.clientY;
    gripButton.setPointerCapture(event.pointerId);
  }

  function handleGripPointerMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragX = event.clientX;
    dragY = event.clientY;
    if (!dragActive) {
      const movedFar =
        Math.abs(dragX - drag.startX) >= DRAG_THRESHOLD ||
        Math.abs(dragY - drag.startY) >= DRAG_THRESHOLD;
      if (!movedFar) return;
      beginDrag();
    }
    if (dragFrame !== 0) return;
    dragFrame = window.requestAnimationFrame(() => {
      dragFrame = 0;
      updateDropTarget();
    });
  }

  function handleGripPointerUp(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const from = drag.pos;
    const target = dropIndex;
    const wasDragging = dragActive;
    endDrag();
    if (!wasDragging) {
      openBlockMenu(from);
      return;
    }
    if (target === null) return;
    moveBlockToIndex(from, target)(view.state, view.dispatch);
    view.focus();
  }

  function handleGripPointerCancel(): void {
    cancelDrag();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !drag) return;
    event.preventDefault();
    cancelDrag();
  }

  function handleInsertClick(event: MouseEvent): void {
    if (hoveredPos === null) return;
    event.preventDefault();
    options.onInsert(hoveredPos);
  }

  const moveTarget = options.scrollHost ?? view.dom;
  moveTarget.addEventListener("mousemove", handlePointerMove, { passive: true });
  moveTarget.addEventListener("mouseleave", handlePointerLeave);
  gripButton.addEventListener("pointerdown", handleGripPointerDown);
  gripButton.addEventListener("pointermove", handleGripPointerMove);
  gripButton.addEventListener("pointerup", handleGripPointerUp);
  gripButton.addEventListener("pointercancel", handleGripPointerCancel);
  gripButton.addEventListener("dragstart", (event) => event.preventDefault());
  window.addEventListener("keydown", handleKeyDown);
  insertButton.addEventListener("mousedown", (event) => event.preventDefault());
  insertButton.addEventListener("click", handleInsertClick);

  return {
    isDragging: () => dragActive,
    hide() {
      if (drag) return;
      hide();
    },
    destroy() {
      if (moveFrame !== 0) window.cancelAnimationFrame(moveFrame);
      endDrag();
      moveTarget.removeEventListener("mousemove", handlePointerMove);
      moveTarget.removeEventListener("mouseleave", handlePointerLeave);
      window.removeEventListener("keydown", handleKeyDown);
      gutter.remove();
      indicator.remove();
    },
  };
}
