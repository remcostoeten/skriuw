import type { CanonicalBlock } from "../types.ts";

export const BOUNDED_EDITOR_UNSUPPORTED = [
  "cross-window clipboard and find",
  "IME composition spanning a window move",
  "cross-window undo history",
  "screen-reader traversal outside the rendered window",
] as const;

export type BoundedSelection = {
  blockIndex: number;
  offset: number;
};

export type BoundedWindow = {
  start: number;
  end: number;
  scrollTop: number;
  selection: BoundedSelection | null;
  focused: boolean;
};

export type CanonicalEdit = {
  blockIndex: number;
  text: string;
};

const BLOCK_HEIGHT = 28;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export type BoundedEditorProjection = {
  getWindow(): BoundedWindow;
  getCanonicalBlocks(): CanonicalBlock[];
  getRenderedBlocks(): CanonicalBlock[];
  focus(selection: BoundedSelection): void;
  blur(): void;
  setScrollTop(scrollTop: number): void;
  moveWindow(requestedStart: number): void;
  applyEditorEdit(edit: CanonicalEdit): void;
  reconcileCanonical(edit: CanonicalEdit): void;
};

export function createBoundedEditorProjection(
  blocks: readonly CanonicalBlock[],
  windowSize: number,
): BoundedEditorProjection {
  if (windowSize <= 0) {
    throw new Error("window size must be positive");
  }
  const canonical = blocks.map((block) => ({ ...block }));
  let windowStart = 0;
  let windowEnd = Math.min(canonical.length, windowSize);
  let scrollTop = 0;
  let selection: BoundedSelection | null = null;
  let focused = false;

  function getWindow(): BoundedWindow {
    return {
      start: windowStart,
      end: windowEnd,
      scrollTop,
      selection: selection ? { ...selection } : null,
      focused,
    };
  }

  function getRenderedBlocks(): CanonicalBlock[] {
    return canonical.slice(windowStart, windowEnd).map((block) => ({ ...block }));
  }

  function getCanonicalBlocks(): CanonicalBlock[] {
    return canonical.map((block) => ({ ...block }));
  }

  function focus(next: BoundedSelection): void {
    const blockIndex = clamp(next.blockIndex, 0, Math.max(0, canonical.length - 1));
    selection = { blockIndex, offset: Math.max(0, next.offset) };
    focused = true;
  }

  function blur(): void {
    focused = false;
  }

  function setScrollTop(next: number): void {
    scrollTop = Math.max(0, next);
  }

  function moveWindow(requestedStart: number): void {
    const nextStart = clamp(Math.floor(requestedStart), 0, Math.max(0, canonical.length - windowSize));
    const previousStart = windowStart;
    windowStart = nextStart;
    windowEnd = Math.min(canonical.length, nextStart + windowSize);
    const anchor = selection;
    if (anchor) {
      const restoredIndex = clamp(anchor.blockIndex, windowStart, windowEnd - 1);
      selection = { blockIndex: restoredIndex, offset: anchor.offset };
      scrollTop = Math.max(0, scrollTop + (previousStart - windowStart) * BLOCK_HEIGHT);
    }
  }

  function applyEditorEdit(edit: CanonicalEdit): void {
    if (edit.blockIndex < windowStart || edit.blockIndex >= windowEnd) {
      throw new Error("cannot edit a block outside the rendered window");
    }
    const current = canonical[edit.blockIndex];
    if (!current) throw new Error("unknown canonical block");
    canonical[edit.blockIndex] = { ...current, text: edit.text };
  }

  function reconcileCanonical(edit: CanonicalEdit): void {
    const current = canonical[edit.blockIndex];
    if (!current) throw new Error("unknown canonical block");
    canonical[edit.blockIndex] = { ...current, text: edit.text };
  }

  return {
    getWindow,
    getCanonicalBlocks,
    getRenderedBlocks,
    focus,
    blur,
    setScrollTop,
    moveWindow,
    applyEditorEdit,
    reconcileCanonical,
  };
}
