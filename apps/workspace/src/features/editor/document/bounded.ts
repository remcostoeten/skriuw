import { clamp } from "@skriuw/shared/helpers/clamp";
import { Fragment, type Attrs, type Node as ProseMirrorNode } from "prosemirror-model";
import { productSchema } from "../schema";

export const BOUNDED_BLOCK_LIMIT = 192;
export const BOUNDED_EDITOR_THRESHOLD = 192;
export const BOUNDED_HISTORY_DEPTH = 200;
export const BOUNDED_HISTORY_GROUP_MS = 500;
export const BOUNDED_GROWTH_STEP = 32;
const SMALLEST_BLOCK_HEIGHT = 20;
const INITIAL_WINDOW_LEAD = 4;
const SMALLEST_INITIAL_WINDOW = 16;

export type BoundedSelection = {
  blockIndex: number;
  offset: number;
};

/** The block at the top of the scroll viewport and how far its top sits from that edge, in pixels. */
export type BoundedViewport = {
  blockIndex: number;
  offset: number;
};

export type WindowGrowth = {
  prepend: ProseMirrorNode[];
  append: ProseMirrorNode[];
};

type HistoryEntry = {
  start: number;
  before: ProseMirrorNode[];
  after: ProseMirrorNode[];
  beforeAttrs: Attrs;
  afterAttrs: Attrs;
  at: number;
};

export type BoundedDocument = {
  blockCount(): number;
  windowStart(): number;
  windowEnd(): number;
  /** Where the window will start once pending growth has rendered. */
  targetStart(): number;
  /** Where the window will end once pending growth has rendered. */
  targetEnd(): number;
  fullDocument(): ProseMirrorNode;
  windowDocument(): ProseMirrorNode;
  moveWindow(start: number): boolean;
  revealBlock(blockIndex: number): boolean;
  /**
   * Shrinks the rendered window to the blocks that fill a viewport of the
   * given height from `blockIndex` down, keeping the full window as the
   * target that `growWindow` fills in afterwards. Returns whether the
   * rendered range changed.
   */
  narrowWindow(blockIndex: number, viewportHeight: number): boolean;
  /**
   * Takes up to `maximum` blocks of pending growth, below the window first,
   * and widens the rendered range by them. Null once the target is rendered.
   */
  growWindow(maximum: number): WindowGrowth | null;
  replaceWindow(document: ProseMirrorNode, at: number): boolean;
  replaceFullDocument(document: ProseMirrorNode, at: number): boolean;
  /**
   * Replaces the whole note with a document the editor renders in full, as
   * when the entire note was selected and replaced, so the window becomes
   * that document.
   */
  replaceWholeWindow(document: ProseMirrorNode, at: number): boolean;
  reconcile(document: ProseMirrorNode): void;
  /**
   * Adopts a document that changed in storage without recording an undo
   * entry. Undo entries after the change shift with it, entries that overlap
   * it are dropped, the remembered selection and the window follow their
   * blocks. Returns whether the window's own document changed, which is when
   * the caller has to update the editor state.
   */
  adoptRemoteDocument(document: ProseMirrorNode): boolean;
  rememberSelection(selection: BoundedSelection | null): void;
  selection(): BoundedSelection | null;
  rememberViewport(viewport: BoundedViewport | null): void;
  viewport(): BoundedViewport | null;
  undo(): boolean;
  redo(): boolean;
  undoDepth(): number;
  redoDepth(): number;
};

function blocksFromDocument(document: ProseMirrorNode): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = [];
  document.forEach((node) => blocks.push(node));
  return blocks;
}

/**
 * Rebuilds a document from its top-level blocks, carrying the root's own
 * attributes across. The annotation layer (ADR-0035) lives there, so dropping
 * them would erase a note's ink every time a bounded note was saved.
 */
export function documentFromBlocks(
  blocks: readonly ProseMirrorNode[],
  attrs: Attrs,
): ProseMirrorNode {
  if (blocks.length === 0) {
    return productSchema.node("doc", attrs, [productSchema.node("paragraph")]);
  }
  return productSchema.node("doc", attrs, Fragment.fromArray([...blocks]));
}

/**
 * Identity comparison is deliberate: ProseMirror allocates a fresh attribute
 * object only when a step actually rewrites one, so this stays O(keys) on the
 * typing path instead of walking a full annotation layer per transaction.
 */
function attributesEqual(left: Attrs, right: Attrs): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

function nodesEqual(left: ProseMirrorNode, right: ProseMirrorNode): boolean {
  return left.eq(right);
}

function changedRange(
  before: readonly ProseMirrorNode[],
  after: readonly ProseMirrorNode[],
): { offset: number; before: ProseMirrorNode[]; after: ProseMirrorNode[] } | null {
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    nodesEqual(before[prefix] as ProseMirrorNode, after[prefix] as ProseMirrorNode)
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    nodesEqual(
      before[before.length - suffix - 1] as ProseMirrorNode,
      after[after.length - suffix - 1] as ProseMirrorNode,
    )
  ) {
    suffix += 1;
  }
  if (prefix === before.length && prefix === after.length) {
    return null;
  }
  return {
    offset: prefix,
    before: before.slice(prefix, before.length - suffix),
    after: after.slice(prefix, after.length - suffix),
  };
}

function spansIntersect(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function windowsEqual(
  before: readonly ProseMirrorNode[],
  after: readonly ProseMirrorNode[],
): boolean {
  if (before.length !== after.length) return false;
  for (let index = 0; index < before.length; index += 1) {
    const left = before[index] as ProseMirrorNode;
    const right = after[index] as ProseMirrorNode;
    if (left !== right && !left.eq(right)) return false;
  }
  return true;
}

export function shouldUseBoundedEditor(document: ProseMirrorNode): boolean {
  return document.childCount > BOUNDED_EDITOR_THRESHOLD;
}

/**
 * @name initialWindowSize
 * @description Number of blocks a progressive window renders first: enough of
 * the smallest block height to cover the viewport, plus a few blocks of lead.
 *
 * @example
 * initialWindowSize(scrollHost.clientHeight); // 50 for a 913 px viewport
 */
export function initialWindowSize(viewportHeight: number): number {
  const covering = Math.ceil(Math.max(0, viewportHeight) / SMALLEST_BLOCK_HEIGHT);
  return clamp(covering + INITIAL_WINDOW_LEAD, SMALLEST_INITIAL_WINDOW, BOUNDED_BLOCK_LIMIT);
}

function shiftedIndex(
  index: number,
  changeStart: number,
  changeEnd: number,
  inserted: number,
): number {
  if (index >= changeEnd) return index + inserted - (changeEnd - changeStart);
  if (index >= changeStart) {
    return clamp(index, changeStart, Math.max(changeStart, changeStart + inserted - 1));
  }
  return index;
}

export function createBoundedDocument(source: ProseMirrorNode): BoundedDocument {
  let blocks = blocksFromDocument(source);
  let attrs: Attrs = source.attrs;
  let start = 0;
  let size = BOUNDED_BLOCK_LIMIT;
  let growBefore = 0;
  let growAfter = 0;
  let rememberedSelection: BoundedSelection | null = null;
  let rememberedViewport: BoundedViewport | null = null;
  const history: HistoryEntry[] = [];
  const redoHistory: HistoryEntry[] = [];

  function maximumStart(): number {
    return Math.max(0, blocks.length - BOUNDED_BLOCK_LIMIT);
  }

  function end(): number {
    return Math.min(blocks.length, start + size);
  }

  function clampGrowth(): void {
    growBefore = clamp(growBefore, 0, start);
    growAfter = clamp(growAfter, 0, blocks.length - end());
  }

  function replaceRange(
    rangeStart: number,
    deleteCount: number,
    replacement: readonly ProseMirrorNode[],
  ): void {
    blocks.splice(rangeStart, deleteCount, ...replacement);
    start = clamp(start, 0, maximumStart());
    clampGrowth();
  }

  function record(entry: HistoryEntry): void {
    const previous = history[history.length - 1];
    if (
      previous &&
      entry.at - previous.at <= BOUNDED_HISTORY_GROUP_MS &&
      previous.start === entry.start &&
      previous.after.length === entry.before.length
    ) {
      previous.after = entry.after;
      previous.afterAttrs = entry.afterAttrs;
      previous.at = entry.at;
    } else {
      history.push(entry);
      if (history.length > BOUNDED_HISTORY_DEPTH) {
        history.splice(0, history.length - BOUNDED_HISTORY_DEPTH);
      }
    }
    redoHistory.length = 0;
  }

  function moveWindow(nextStart: number): boolean {
    const clamped = clamp(Math.floor(nextStart), 0, maximumStart());
    const resized = size !== BOUNDED_BLOCK_LIMIT || growBefore > 0 || growAfter > 0;
    size = BOUNDED_BLOCK_LIMIT;
    growBefore = 0;
    growAfter = 0;
    if (clamped === start && !resized) {
      return false;
    }
    start = clamped;
    return true;
  }

  function narrowWindow(blockIndex: number, viewportHeight: number): boolean {
    const focus = clamp(blockIndex, 0, Math.max(0, blocks.length - 1));
    let targetFrom = start - growBefore;
    let targetTo = end() + growAfter;
    if (focus < targetFrom || focus >= targetTo || targetTo - targetFrom < BOUNDED_BLOCK_LIMIT) {
      targetFrom =
        focus >= targetFrom && focus < targetFrom + BOUNDED_BLOCK_LIMIT
          ? clamp(targetFrom, 0, maximumStart())
          : clamp(focus - Math.floor(BOUNDED_BLOCK_LIMIT / 2), 0, maximumStart());
      targetTo = Math.min(blocks.length, targetFrom + BOUNDED_BLOCK_LIMIT);
    }
    const initial = initialWindowSize(viewportHeight);
    const to = Math.min(targetTo, clamp(focus, targetFrom, targetTo) + initial);
    const from = Math.max(targetFrom, to - initial);
    const changed = from !== start || to !== end();
    start = from;
    size = to - from;
    growBefore = from - targetFrom;
    growAfter = targetTo - to;
    return changed;
  }

  function growWindow(maximum: number): WindowGrowth | null {
    clampGrowth();
    const step = Math.max(1, Math.floor(maximum));
    if (growAfter > 0) {
      const count = Math.min(step, growAfter);
      const append = blocks.slice(end(), end() + count);
      size += count;
      growAfter -= count;
      return { prepend: [], append };
    }
    if (growBefore > 0) {
      const count = Math.min(step, growBefore);
      const prepend = blocks.slice(start - count, start);
      start -= count;
      size += count;
      growBefore -= count;
      return { prepend, append: [] };
    }
    return null;
  }

  function revealBlock(blockIndex: number): boolean {
    const target = clamp(blockIndex, 0, Math.max(0, blocks.length - 1));
    if (target >= start && target < end()) {
      return false;
    }
    const centered = target - Math.floor(BOUNDED_BLOCK_LIMIT / 2);
    return moveWindow(centered);
  }

  function replaceWindow(document: ProseMirrorNode, at: number): boolean {
    const before = blocks.slice(start, end());
    const after = blocksFromDocument(document);
    const beforeAttrs = attrs;
    const change = changedRange(before, after);
    if (!change) {
      return adoptAttributes(document, start, at);
    }
    const entryStart = start + change.offset;
    attrs = document.attrs;
    blocks.splice(entryStart, change.before.length, ...change.after);
    size = after.length;
    clampGrowth();
    record({
      start: entryStart,
      before: change.before,
      after: change.after,
      beforeAttrs,
      afterAttrs: attrs,
      at,
    });
    return true;
  }

  function replaceFullDocument(document: ProseMirrorNode, at: number): boolean {
    const next = blocksFromDocument(document);
    const beforeAttrs = attrs;
    const change = changedRange(blocks, next);
    if (!change) {
      return adoptAttributes(document, start, at);
    }
    attrs = document.attrs;
    replaceRange(change.offset, change.before.length, change.after);
    record({
      start: change.offset,
      before: change.before,
      after: change.after,
      beforeAttrs,
      afterAttrs: attrs,
      at,
    });
    return true;
  }

  function replaceWholeWindow(document: ProseMirrorNode, at: number): boolean {
    const changed = replaceFullDocument(document, at);
    start = 0;
    size = blocks.length;
    growBefore = 0;
    growAfter = 0;
    return changed;
  }

  /**
   * A drawing edit rewrites the root's attributes and nothing else, so it
   * reaches here with an unchanged block range and still has to be recorded —
   * otherwise the stroke is dropped and cannot be undone.
   */
  function adoptAttributes(document: ProseMirrorNode, entryStart: number, at: number): boolean {
    if (attributesEqual(attrs, document.attrs)) {
      return false;
    }
    const beforeAttrs = attrs;
    attrs = document.attrs;
    record({
      start: entryStart,
      before: [],
      after: [],
      beforeAttrs,
      afterAttrs: attrs,
      at,
    });
    return true;
  }

  function shiftHistory(
    entries: HistoryEntry[],
    occupied: (entry: HistoryEntry) => number,
    changeStart: number,
    changeEnd: number,
    delta: number,
  ): void {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index] as HistoryEntry;
      const entryEnd = entry.start + occupied(entry);
      const insertionInside =
        entry.start === entryEnd && changeStart < entry.start && entry.start < changeEnd;
      if (spansIntersect(entry.start, entryEnd, changeStart, changeEnd) || insertionInside) {
        entries.splice(index, 1);
      } else if (entry.start >= changeEnd) {
        entry.start += delta;
      }
    }
  }

  function adoptRemoteDocument(document: ProseMirrorNode): boolean {
    const next = blocksFromDocument(document);
    const attrsChanged = !attributesEqual(attrs, document.attrs);
    attrs = document.attrs;
    const change = changedRange(blocks, next);
    if (!change) return attrsChanged;
    const changeStart = change.offset;
    const changeEnd = changeStart + change.before.length;
    const delta = change.after.length - change.before.length;
    const windowBefore = blocks.slice(start, end());
    blocks.splice(changeStart, change.before.length, ...change.after);
    shiftHistory(history, (entry) => entry.after.length, changeStart, changeEnd, delta);
    shiftHistory(redoHistory, (entry) => entry.before.length, changeStart, changeEnd, delta);
    const lastBlock = Math.max(0, blocks.length - 1);
    if (rememberedSelection) {
      const blockIndex = shiftedIndex(
        rememberedSelection.blockIndex,
        changeStart,
        changeEnd,
        change.after.length,
      );
      const inside =
        rememberedSelection.blockIndex >= changeStart && rememberedSelection.blockIndex < changeEnd;
      rememberedSelection = {
        blockIndex: clamp(blockIndex, 0, lastBlock),
        offset: inside ? 0 : rememberedSelection.offset,
      };
    }
    if (rememberedViewport) {
      rememberedViewport = {
        blockIndex: clamp(
          shiftedIndex(rememberedViewport.blockIndex, changeStart, changeEnd, change.after.length),
          0,
          lastBlock,
        ),
        offset: rememberedViewport.offset,
      };
    }
    if (start >= changeEnd) start += delta;
    start = clamp(start, 0, maximumStart());
    clampGrowth();
    return attrsChanged || !windowsEqual(windowBefore, blocks.slice(start, end()));
  }

  function applyHistory(entry: HistoryEntry, reverse: boolean): void {
    const remove = reverse ? entry.after : entry.before;
    const insert = reverse ? entry.before : entry.after;
    attrs = reverse ? entry.beforeAttrs : entry.afterAttrs;
    replaceRange(entry.start, remove.length, insert);
    revealBlock(entry.start);
  }

  return {
    blockCount: () => blocks.length,
    windowStart: () => start,
    windowEnd: end,
    targetStart: () => start - growBefore,
    targetEnd: () => end() + growAfter,
    fullDocument: () => documentFromBlocks(blocks, attrs),
    windowDocument: () => documentFromBlocks(blocks.slice(start, end()), attrs),
    moveWindow,
    revealBlock,
    narrowWindow,
    growWindow,
    replaceWindow,
    replaceFullDocument,
    replaceWholeWindow,
    adoptRemoteDocument,
    reconcile(document) {
      blocks = blocksFromDocument(document);
      attrs = document.attrs;
      start = clamp(start, 0, maximumStart());
      clampGrowth();
      history.length = 0;
      redoHistory.length = 0;
    },
    rememberSelection(selection) {
      rememberedSelection = selection ? { ...selection } : null;
    },
    selection: () => (rememberedSelection ? { ...rememberedSelection } : null),
    rememberViewport(viewport) {
      rememberedViewport = viewport ? { ...viewport } : null;
    },
    viewport: () => (rememberedViewport ? { ...rememberedViewport } : null),
    undo() {
      const entry = history.pop();
      if (!entry) {
        return false;
      }
      applyHistory(entry, true);
      redoHistory.push(entry);
      return true;
    },
    redo() {
      const entry = redoHistory.pop();
      if (!entry) {
        return false;
      }
      applyHistory(entry, false);
      history.push(entry);
      return true;
    },
    undoDepth: () => history.length,
    redoDepth: () => redoHistory.length,
  };
}

export function topLevelBlockAtPosition(document: ProseMirrorNode, position: number): number {
  let offset = 0;
  for (let index = 0; index < document.childCount; index += 1) {
    const block = document.child(index);
    if (position <= offset + block.nodeSize) {
      return index;
    }
    offset += block.nodeSize;
  }
  return Math.max(0, document.childCount - 1);
}

export function topLevelTextPosition(
  document: ProseMirrorNode,
  blockIndex: number,
  offset: number,
): number {
  const index = clamp(blockIndex, 0, Math.max(0, document.childCount - 1));
  let blockPosition = 0;
  for (let current = 0; current < index; current += 1) {
    blockPosition += document.child(current).nodeSize;
  }
  const block = document.child(index);
  const contentStart = blockPosition + 1;
  const requested = contentStart + clamp(Math.max(0, offset), 0, block.content.size);
  if (block.isTextblock) {
    return requested;
  }
  let before: number | null = null;
  let after: number | null = null;
  let inside: number | null = null;
  block.descendants((node, position) => {
    if (inside !== null || !node.isTextblock) return inside === null;
    const start = contentStart + position + 1;
    const end = start + node.content.size;
    if (requested >= start && requested <= end) {
      inside = requested;
    } else if (end < requested) {
      before = end;
    } else if (after === null) {
      after = start;
    }
    return false;
  });
  return inside ?? after ?? before ?? contentStart;
}
