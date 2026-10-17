import type { Transaction } from "prosemirror-state";
import { AttrStep } from "prosemirror-transform";

export type ChangedRange = { from: number; to: number };

function clampRange(from: number, to: number, size: number): ChangedRange {
  const start = Math.min(Math.max(from, 0), size);
  return { from: start, to: Math.min(Math.max(to, start), size) };
}

function mergeRanges(ranges: ChangedRange[]): ChangedRange[] {
  const sorted = [...ranges].sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: ChangedRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * @name changedRanges
 * @description Lists the document ranges a transaction replaced or whose node
 * attributes it changed, in the coordinates of `transaction.doc`, sorted and
 * with overlapping or touching ranges merged. A transaction that leaves the
 * document untouched yields an empty list.
 *
 * @example
 * for (const { from, to } of changedRanges(transaction)) {
 *   transaction.doc.nodesBetween(from, to, visit);
 * }
 */
export function changedRanges(transaction: Transaction): ChangedRange[] {
  const size = transaction.doc.content.size;
  const { mapping, steps } = transaction;
  const ranges: ChangedRange[] = [];
  mapping.maps.forEach((map, index) => {
    const rest = mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push(clampRange(rest.map(newStart, -1), rest.map(newEnd, 1), size));
    });
    const step = steps[index];
    if (step instanceof AttrStep) {
      const pos = rest.map(step.pos, 1);
      ranges.push(clampRange(pos, pos + 1, size));
    }
  });
  return mergeRanges(ranges);
}
