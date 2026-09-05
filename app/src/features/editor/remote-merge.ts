import { Slice, type Attrs, type Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, Selection, type Plugin, type Transaction } from "prosemirror-state";
import { ReplaceStep } from "prosemirror-transform";
import { documentFromBlocks } from "./bounded-document";

/** Transaction meta marking a document change that came from storage, not the user. */
export const REMOTE_APPLY_META = "remoteApply";

export type ContentDiff = {
  start: number;
  endA: number;
  endB: number;
};

/**
 * The changed range between two documents, in the coordinates of each. The
 * prefix and suffix scans can cross when one document repeats content the
 * other has once (typing "a" after "a"); the overlap correction pushes the
 * end back to the start on the shorter side, the way ProseMirror's own DOM
 * change reader does, so the range never inverts.
 */
export function contentDiff(current: ProseMirrorNode, incoming: ProseMirrorNode): ContentDiff | null {
  const start = current.content.findDiffStart(incoming.content);
  if (start === null) return null;
  const end = current.content.findDiffEnd(incoming.content);
  let endA = end?.a ?? current.content.size;
  let endB = end?.b ?? incoming.content.size;
  if (endA < start && current.content.size < incoming.content.size) {
    endB += start - endA;
    endA = start;
  } else if (endB < start) {
    endA += start - endB;
    endB = start;
  }
  return { start, endA, endB };
}

export type RemoteStrategy = "attrs" | "step" | "depth0";

export type RemoteApplication =
  | { kind: "unchanged" }
  | { kind: "transaction"; tr: Transaction; strategy: RemoteStrategy }
  | { kind: "rebuild" };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function caretAfterReplace(head: number, diff: ContentDiff): number {
  if (head < diff.start) return head;
  if (head > diff.endA) return head + (diff.endB - diff.endA);
  return clamp(diff.start + (head - diff.start), diff.start, diff.endB);
}

function attributeKeys(current: Attrs, incoming: Attrs): string[] {
  return [...new Set([...Object.keys(current), ...Object.keys(incoming)])];
}

function withAttributes(tr: Transaction, incoming: ProseMirrorNode): boolean {
  let changed = false;
  for (const key of attributeKeys(tr.doc.attrs, incoming.attrs)) {
    if (tr.doc.attrs[key] !== incoming.attrs[key]) {
      tr.setDocAttribute(key, incoming.attrs[key]);
      changed = true;
    }
  }
  return changed;
}

function stampRemote(tr: Transaction): Transaction {
  return tr.setMeta("addToHistory", false).setMeta(REMOTE_APPLY_META, true);
}

function placeCaret(tr: Transaction, position: number): void {
  const resolved = tr.doc.resolve(clamp(position, 0, tr.doc.content.size));
  tr.setSelection(Selection.near(resolved));
}

function attemptStep(
  state: EditorState,
  incoming: ProseMirrorNode,
  step: ReplaceStep,
  caret: number,
): Transaction | null {
  const tr = state.tr;
  withAttributes(tr, incoming);
  if (tr.maybeStep(step).failed || !tr.doc.eq(incoming)) return null;
  placeCaret(tr, caret);
  return tr;
}

/**
 * Builds the transaction that turns the editor's document into `incoming`
 * while keeping plugin state, decorations and undo history mapped. Root
 * attributes (the annotation layer) go through attribute steps; content goes
 * through one validated `ReplaceStep` over the changed range, falling back to
 * a depth-0 replacement of the whole content. A caret inside the replaced
 * range keeps its offset from the range start, clamped to the new range. The
 * result is "rebuild" only when no step reproduces the incoming document,
 * which leaves the caller to create a fresh state.
 */
export function buildRemoteTr(state: EditorState, incoming: ProseMirrorNode): RemoteApplication {
  const current = state.doc;
  const diff = contentDiff(current, incoming);
  const head = state.selection.head;
  if (!diff) {
    const tr = state.tr;
    if (!withAttributes(tr, incoming)) return { kind: "unchanged" };
    return { kind: "transaction", tr: stampRemote(tr), strategy: "attrs" };
  }
  const caret = caretAfterReplace(head, diff);
  const ranged = attemptStep(
    state,
    incoming,
    new ReplaceStep(diff.start, diff.endA, incoming.slice(diff.start, diff.endB)),
    caret,
  );
  if (ranged) return { kind: "transaction", tr: stampRemote(ranged), strategy: "step" };
  const whole = attemptStep(
    state,
    incoming,
    new ReplaceStep(0, current.content.size, new Slice(incoming.content, 0, 0)),
    caret,
  );
  if (whole) return { kind: "transaction", tr: stampRemote(whole), strategy: "depth0" };
  return { kind: "rebuild" };
}

export type RemoteApplied = {
  state: EditorState;
  strategy: RemoteStrategy | "unchanged" | "rebuild";
};

/**
 * Applies `incoming` to a detached editor state (a cached note that is not on
 * screen), rebuilding from scratch when no transaction can express the change.
 */
export function applyRemoteDocument(
  state: EditorState,
  incoming: ProseMirrorNode,
  plugins: readonly Plugin[],
): RemoteApplied {
  const application = buildRemoteTr(state, incoming);
  if (application.kind === "unchanged") return { state, strategy: "unchanged" };
  if (application.kind === "transaction") {
    return { state: state.apply(application.tr), strategy: application.strategy };
  }
  const rebuilt = EditorState.create({ doc: incoming, plugins: [...plugins] });
  const head = clamp(state.selection.head, 0, incoming.content.size);
  return {
    state: rebuilt.apply(rebuilt.tr.setSelection(Selection.near(rebuilt.doc.resolve(head)))),
    strategy: "rebuild",
  };
}

/** A run of base blocks `[start, end)` that a document replaced with `replacement`. */
export type BlockRegion = {
  start: number;
  end: number;
  replacement: ProseMirrorNode[];
};

export function blocksOf(document: ProseMirrorNode): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = [];
  document.forEach((node) => blocks.push(node));
  return blocks;
}

const LCS_CELL_BUDGET = 4_000_000;

function lcsTable(before: readonly ProseMirrorNode[], after: readonly ProseMirrorNode[]): Uint32Array {
  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = before[i]!.eq(after[j]!)
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  return table;
}

/**
 * The regions of `base` that `next` changed, at top-level block granularity,
 * from a longest-common-subsequence alignment on block equality. Unchanged
 * prefix and suffix are trimmed first so the quadratic alignment only sees
 * the edited middle; beyond a cell budget the middle becomes one region.
 */
export function blockChanges(
  base: readonly ProseMirrorNode[],
  next: readonly ProseMirrorNode[],
): BlockRegion[] {
  let prefix = 0;
  while (prefix < base.length && prefix < next.length && base[prefix]!.eq(next[prefix]!)) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < base.length - prefix &&
    suffix < next.length - prefix &&
    base[base.length - suffix - 1]!.eq(next[next.length - suffix - 1]!)
  ) {
    suffix += 1;
  }
  const before = base.slice(prefix, base.length - suffix);
  const after = next.slice(prefix, next.length - suffix);
  if (before.length === 0 && after.length === 0) return [];
  if (before.length === 0 || after.length === 0 || before.length * after.length > LCS_CELL_BUDGET) {
    return [{ start: prefix, end: prefix + before.length, replacement: after }];
  }
  const width = after.length + 1;
  const table = lcsTable(before, after);
  const regions: BlockRegion[] = [];
  let i = 0;
  let j = 0;
  let open: BlockRegion | null = null;
  function close(): void {
    if (open) regions.push(open);
    open = null;
  }
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i]!.eq(after[j]!)) {
      close();
      i += 1;
      j += 1;
      continue;
    }
    open ??= { start: prefix + i, end: prefix + i, replacement: [] };
    if (
      j < after.length &&
      (i >= before.length || table[(i + 1) * width + j]! < table[i * width + j + 1]!)
    ) {
      open.replacement.push(after[j]!);
      j += 1;
    } else {
      open.end += 1;
      i += 1;
    }
  }
  close();
  return regions;
}

function regionsIntersect(left: BlockRegion, right: BlockRegion): boolean {
  return left.start < right.end && right.start < left.end;
}

type SourcedRegion = BlockRegion & { source: "local" | "remote" };

function mergeAttributes(base: Attrs, local: Attrs, incoming: Attrs): Attrs {
  const merged: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(incoming)])) {
    if (local[key] !== base[key]) merged[key] = local[key];
    else if (incoming[key] !== base[key]) merged[key] = incoming[key];
    else merged[key] = base[key];
  }
  return merged;
}

/**
 * Three-way merge of a note the user is editing while another device saved
 * it. Both sides are diffed against the last document this device knew was
 * durable; every local region survives, and remote regions land unless they
 * touch a base block the local side also changed, in which case the local
 * version wins for that block (the remote body is still in history). Root
 * attributes take whichever side changed them, local first.
 */
export function mergeDocuments(
  base: ProseMirrorNode,
  local: ProseMirrorNode,
  incoming: ProseMirrorNode,
): ProseMirrorNode {
  const baseBlocks = blocksOf(base);
  const localRegions: SourcedRegion[] = blockChanges(baseBlocks, blocksOf(local)).map(
    (region) => ({ ...region, source: "local" }),
  );
  const remoteRegions: SourcedRegion[] = blockChanges(baseBlocks, blocksOf(incoming))
    .filter((region) => !localRegions.some((local) => regionsIntersect(local, region)))
    .map((region) => ({ ...region, source: "remote" }));
  const regions = [...localRegions, ...remoteRegions].sort(
    (left, right) =>
      left.start - right.start ||
      (left.source === right.source ? 0 : left.source === "local" ? -1 : 1),
  );
  const merged: ProseMirrorNode[] = [];
  let cursor = 0;
  for (const region of regions) {
    merged.push(...baseBlocks.slice(cursor, Math.max(cursor, region.start)));
    merged.push(...region.replacement);
    cursor = Math.max(cursor, region.end);
  }
  merged.push(...baseBlocks.slice(cursor));
  return documentFromBlocks(merged, mergeAttributes(base.attrs, local.attrs, incoming.attrs));
}
