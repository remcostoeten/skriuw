import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { TextSelection, type EditorState, type Selection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  BOUNDED_GROWTH_STEP,
  topLevelTextPosition,
  type BoundedDocument,
  type BoundedSelection,
  type BoundedViewport,
  type WindowGrowth,
} from "./bounded";

const IDLE_TIMEOUT_MS = 250;

export type WindowGrowthHost = {
  view(): EditorView | null;
  bounded(): BoundedDocument | null;
  scrollHost(): HTMLElement | null;
  /** True while growth must wait: an IME composition or a block drag is in progress. */
  paused(): boolean;
  installed(state: EditorState): void;
};

export type WindowGrowthController = {
  /** Starts filling the active note's window, restoring `selection` once it renders if the caret has not moved. */
  start(selection: BoundedSelection | null): void;
  /** Renders all pending growth now, for input that needs a block the window has not reached yet. */
  flush(): void;
  cancel(): void;
};

type IdleHandle = { cancel(): void };

type PendingSelection = {
  target: BoundedSelection;
  installed: Selection;
};

function requestIdle(callback: () => void): IdleHandle {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    return { cancel: () => window.cancelIdleCallback(id) };
  }
  const id = globalThis.setTimeout(callback, 0);
  return { cancel: () => globalThis.clearTimeout(id) };
}

const blockPositionCache = new WeakMap<ProseMirrorNode, readonly number[]>();

function blockPositions(document: ProseMirrorNode): readonly number[] {
  const cached = blockPositionCache.get(document);
  if (cached) return cached;
  const positions: number[] = [];
  let position = 0;
  document.forEach((node) => {
    positions.push(position);
    position += node.nodeSize;
  });
  blockPositionCache.set(document, positions);
  return positions;
}

function blockElement(view: EditorView, position: number): HTMLElement | null {
  const node = view.nodeDOM(position);
  return node instanceof HTMLElement ? node : null;
}

function fragmentSize(nodes: readonly ProseMirrorNode[]): number {
  return nodes.reduce((total, node) => total + node.nodeSize, 0);
}

function hasPendingGrowth(bounded: BoundedDocument): boolean {
  return bounded.windowStart() > bounded.targetStart() || bounded.windowEnd() < bounded.targetEnd();
}

function rendersWindow(view: EditorView, bounded: BoundedDocument): boolean {
  return view.state.doc.childCount === bounded.windowEnd() - bounded.windowStart();
}

/**
 * @name captureViewport
 * @description Finds the first rendered top-level block whose bottom is below
 * the top of the scroll viewport, so the same block can be put back at the same
 * offset after the window is rebuilt from a different start.
 *
 * @example
 * bounded.rememberViewport(captureViewport(view, scrollHost, bounded.windowStart()));
 */
export function captureViewport(
  view: EditorView,
  scrollHost: HTMLElement,
  windowStart: number,
): BoundedViewport | null {
  const positions = blockPositions(view.state.doc);
  if (positions.length === 0) return null;
  const viewportTop = scrollHost.getBoundingClientRect().top;
  let low = 0;
  let high = positions.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    const element = blockElement(view, positions[middle] ?? 0);
    if (!element || element.getBoundingClientRect().bottom > viewportTop) high = middle;
    else low = middle + 1;
  }
  const element = blockElement(view, positions[low] ?? 0);
  if (!element) return null;
  return {
    blockIndex: windowStart + low,
    offset: element.getBoundingClientRect().top - viewportTop,
  };
}

/**
 * @name restoreViewport
 * @description Scrolls so the remembered block sits at its remembered offset
 * from the top of the viewport. Returns false when that block is not rendered.
 *
 * @example
 * if (!restoreViewport(view, scrollHost, viewport, bounded.windowStart())) {
 *   scrollHost.scrollTop = entry.scrollTop;
 * }
 */
export function restoreViewport(
  view: EditorView,
  scrollHost: HTMLElement,
  viewport: BoundedViewport,
  windowStart: number,
): boolean {
  const index = viewport.blockIndex - windowStart;
  const position = blockPositions(view.state.doc)[index];
  if (position === undefined) return false;
  const element = blockElement(view, position);
  if (!element) return false;
  const offset = element.getBoundingClientRect().top - scrollHost.getBoundingClientRect().top;
  const delta = offset - viewport.offset;
  if (Math.abs(delta) >= 1) scrollHost.scrollTop += delta;
  return true;
}

/**
 * @name createWindowGrowth
 * @description Grows a narrowed bounded window back to its full size in idle
 * time, one step of blocks per idle callback, without recording an edit or an
 * undo step. Blocks added above the viewport are compensated in the scroll
 * position so what is on screen does not move.
 *
 * @example
 * const growth = createWindowGrowth(host);
 * bounded.narrowWindow(anchor, viewportHeight);
 * growth.start(bounded.selection());
 */
export function createWindowGrowth(host: WindowGrowthHost): WindowGrowthController {
  let handle: IdleHandle | null = null;
  let pendingSelection: PendingSelection | null = null;

  function cancel(): void {
    handle?.cancel();
    handle = null;
    pendingSelection = null;
  }

  function schedule(): void {
    if (handle) return;
    handle = requestIdle(() => {
      handle = null;
      if (step(BOUNDED_GROWTH_STEP)) schedule();
    });
  }

  function restoredSelection(
    state: EditorState,
    bounded: BoundedDocument,
  ): BoundedSelection | null {
    const pending = pendingSelection;
    if (!pending || !state.selection.eq(pending.installed)) {
      pendingSelection = null;
      return null;
    }
    const { blockIndex } = pending.target;
    if (blockIndex < bounded.windowStart() || blockIndex >= bounded.windowEnd()) return null;
    pendingSelection = null;
    return pending.target;
  }

  function apply(view: EditorView, bounded: BoundedDocument, growth: WindowGrowth): void {
    const before = view.state;
    const tr = before.tr;
    if (growth.append.length > 0) tr.insert(tr.doc.content.size, Fragment.fromArray(growth.append));
    if (growth.prepend.length > 0) tr.insert(0, Fragment.fromArray(growth.prepend));
    const selection = restoredSelection(before, bounded);
    if (selection) {
      const position = topLevelTextPosition(
        tr.doc,
        selection.blockIndex - bounded.windowStart(),
        selection.offset,
      );
      tr.setSelection(TextSelection.create(tr.doc, position));
      bounded.rememberSelection(selection);
    }
    tr.setMeta("addToHistory", false);
    const next = before.apply(tr);
    const scrollHost = host.scrollHost();
    const reference = growth.prepend.length > 0 ? blockElement(view, 0) : null;
    if (!reference || !scrollHost) {
      view.updateState(next);
      host.installed(view.state);
      if (pendingSelection) pendingSelection.installed = view.state.selection;
      return;
    }
    const top = reference.getBoundingClientRect().top;
    const anchoring = scrollHost.style.overflowAnchor;
    scrollHost.style.overflowAnchor = "none";
    view.updateState(next);
    host.installed(view.state);
    if (pendingSelection) pendingSelection.installed = view.state.selection;
    const moved = blockElement(view, fragmentSize(growth.prepend));
    const shift = moved ? moved.getBoundingClientRect().top - top : 0;
    if (Math.abs(shift) >= 1) scrollHost.scrollTop += shift;
    scrollHost.style.overflowAnchor = anchoring;
  }

  function step(maximum: number): boolean {
    const view = host.view();
    const bounded = host.bounded();
    if (!view || !bounded || !rendersWindow(view, bounded)) {
      pendingSelection = null;
      return false;
    }
    if (host.paused()) return true;
    const growth = bounded.growWindow(maximum);
    if (!growth) {
      pendingSelection = null;
      return false;
    }
    apply(view, bounded, growth);
    return hasPendingGrowth(bounded);
  }

  return {
    start(selection) {
      cancel();
      const view = host.view();
      const bounded = host.bounded();
      if (!view || !bounded || !hasPendingGrowth(bounded)) return;
      if (
        selection &&
        (selection.blockIndex < bounded.windowStart() ||
          selection.blockIndex >= bounded.windowEnd()) &&
        selection.blockIndex >= bounded.targetStart() &&
        selection.blockIndex < bounded.targetEnd()
      ) {
        pendingSelection = { target: selection, installed: view.state.selection };
      }
      schedule();
    },
    flush() {
      handle?.cancel();
      handle = null;
      while (step(Number.MAX_SAFE_INTEGER)) {
        if (host.paused()) {
          schedule();
          return;
        }
      }
    },
    cancel,
  };
}
