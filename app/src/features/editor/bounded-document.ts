import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { productSchema } from "./schema";

export const BOUNDED_BLOCK_LIMIT = 192;
export const BOUNDED_EDITOR_THRESHOLD = 192;
export const BOUNDED_HISTORY_DEPTH = 200;
export const BOUNDED_HISTORY_GROUP_MS = 500;

export type BoundedSelection = {
  blockIndex: number;
  offset: number;
};

type HistoryEntry = {
  start: number;
  before: ProseMirrorNode[];
  after: ProseMirrorNode[];
  at: number;
};

export type BoundedDocument = {
  blockCount(): number;
  windowStart(): number;
  windowEnd(): number;
  fullDocument(): ProseMirrorNode;
  windowDocument(): ProseMirrorNode;
  moveWindow(start: number): boolean;
  revealBlock(blockIndex: number): boolean;
  replaceWindow(document: ProseMirrorNode, at: number): boolean;
  replaceFullDocument(document: ProseMirrorNode, at: number): boolean;
  reconcile(document: ProseMirrorNode): void;
  rememberSelection(selection: BoundedSelection | null): void;
  selection(): BoundedSelection | null;
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

function documentFromBlocks(blocks: readonly ProseMirrorNode[]): ProseMirrorNode {
  if (blocks.length === 0) {
    return productSchema.node("doc", null, [productSchema.node("paragraph")]);
  }
  return productSchema.node("doc", null, Fragment.fromArray([...blocks]));
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function shouldUseBoundedEditor(document: ProseMirrorNode): boolean {
  return document.childCount > BOUNDED_EDITOR_THRESHOLD;
}

export function createBoundedDocument(source: ProseMirrorNode): BoundedDocument {
  let blocks = blocksFromDocument(source);
  let start = 0;
  let rememberedSelection: BoundedSelection | null = null;
  const history: HistoryEntry[] = [];
  const redoHistory: HistoryEntry[] = [];

  function maximumStart(): number {
    return Math.max(0, blocks.length - BOUNDED_BLOCK_LIMIT);
  }

  function end(): number {
    return Math.min(blocks.length, start + BOUNDED_BLOCK_LIMIT);
  }

  function replaceRange(
    rangeStart: number,
    deleteCount: number,
    replacement: readonly ProseMirrorNode[],
  ): void {
    blocks.splice(rangeStart, deleteCount, ...replacement);
    start = clamp(start, 0, maximumStart());
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
    if (clamped === start) {
      return false;
    }
    start = clamped;
    return true;
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
    const change = changedRange(before, after);
    if (!change) {
      return false;
    }
    const entryStart = start + change.offset;
    replaceRange(entryStart, change.before.length, change.after);
    record({ start: entryStart, before: change.before, after: change.after, at });
    return true;
  }

  function replaceFullDocument(document: ProseMirrorNode, at: number): boolean {
    const next = blocksFromDocument(document);
    const change = changedRange(blocks, next);
    if (!change) {
      return false;
    }
    replaceRange(change.offset, change.before.length, change.after);
    record({ start: change.offset, before: change.before, after: change.after, at });
    return true;
  }

  function applyHistory(entry: HistoryEntry, reverse: boolean): void {
    const remove = reverse ? entry.after : entry.before;
    const insert = reverse ? entry.before : entry.after;
    replaceRange(entry.start, remove.length, insert);
    revealBlock(entry.start);
  }

  return {
    blockCount: () => blocks.length,
    windowStart: () => start,
    windowEnd: end,
    fullDocument: () => documentFromBlocks(blocks),
    windowDocument: () => documentFromBlocks(blocks.slice(start, end())),
    moveWindow,
    revealBlock,
    replaceWindow,
    replaceFullDocument,
    reconcile(document) {
      blocks = blocksFromDocument(document);
      start = clamp(start, 0, maximumStart());
      history.length = 0;
      redoHistory.length = 0;
    },
    rememberSelection(selection) {
      rememberedSelection = selection ? { ...selection } : null;
    },
    selection: () => (rememberedSelection ? { ...rememberedSelection } : null),
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
  textOffset: number,
): number {
  const index = clamp(blockIndex, 0, Math.max(0, document.childCount - 1));
  let position = 0;
  for (let current = 0; current < index; current += 1) {
    position += document.child(current).nodeSize;
  }
  let node = document.child(index);
  while (!node.isTextblock && node.childCount > 0) {
    position += 1;
    node = node.child(0);
  }
  return position + 1 + Math.min(Math.max(0, textOffset), node.textContent.length);
}
