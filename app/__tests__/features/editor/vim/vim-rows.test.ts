import assert from "node:assert/strict";
import test from "node:test";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { parseProductMarkdown } from "../../../../src/features/editor/schema";
import { stepDisplayRow, type RowMeasure } from "../../../../src/features/editor/vim/vim-rows";
import { CHAR_WIDTH, wrappedLayout } from "./wrapped-layout";

function charAt(doc: ProseMirrorNode, pos: number): string {
  return doc.textBetween(pos, pos + 1);
}

test("j and k walk the wrapped rows of one paragraph before crossing to the next", () => {
  const doc = parseProductMarkdown("abcdefghijklmnopqrstuvwxyz\n\n0123456789ABC");
  const measure = wrappedLayout(doc, 10);
  const start = 1 + 2;
  const down = stepDisplayRow(doc, measure, start, 1, 1, null);
  assert.ok(down);
  assert.equal(charAt(doc, down.pos), "m");
  assert.equal(down.x, 2 * CHAR_WIDTH);
  const again = stepDisplayRow(doc, measure, down.pos, 1, 1, down.x);
  assert.ok(again);
  assert.equal(charAt(doc, again.pos), "w");
  const crossed = stepDisplayRow(doc, measure, again.pos, 1, 1, again.x);
  assert.ok(crossed);
  assert.equal(charAt(doc, crossed.pos), "2");
  const back = stepDisplayRow(doc, measure, crossed.pos, -1, 1, crossed.x);
  assert.ok(back);
  assert.equal(charAt(doc, back.pos), "w");
  const up = stepDisplayRow(doc, measure, back.pos, -1, 2, back.x);
  assert.ok(up);
  assert.equal(charAt(doc, up.pos), "c");
});

test("a short row clamps the goal column and a later row restores it", () => {
  const doc = parseProductMarkdown("abcdefghijklmnopqrstuvwxyz\n\nxy\n\n0123456789");
  const measure = wrappedLayout(doc, 10);
  const first = stepDisplayRow(doc, measure, 1 + 8, 1, 2, null);
  assert.ok(first);
  assert.equal(charAt(doc, first.pos), "z");
  const short = stepDisplayRow(doc, measure, first.pos, 1, 1, first.x);
  assert.ok(short);
  assert.equal(charAt(doc, short.pos), "y");
  const restored = stepDisplayRow(doc, measure, short.pos, 1, 1, short.x);
  assert.ok(restored);
  assert.equal(charAt(doc, restored.pos), "8");
});

test("an infinite goal sticks to row ends and counts stop at the document edge", () => {
  const doc = parseProductMarkdown("abcdefghijklmnopqrstuvwxyz");
  const measure = wrappedLayout(doc, 10);
  const end = stepDisplayRow(doc, measure, 1, 1, 1, Number.POSITIVE_INFINITY);
  assert.ok(end);
  assert.equal(charAt(doc, end.pos), "t");
  const last = stepDisplayRow(doc, measure, end.pos, 1, 5, Number.POSITIVE_INFINITY);
  assert.ok(last);
  assert.equal(charAt(doc, last.pos), "z");
  assert.equal(stepDisplayRow(doc, measure, last.pos, 1, 1, null), null);
  assert.equal(stepDisplayRow(doc, measure, 1, -1, 1, null), null);
});

test("hard breaks and empty lines are rows of their own", () => {
  const doc = parseProductMarkdown("abcdefghijkl\\\nm\n\n```\nq\n\nz\n```");
  const measure = wrappedLayout(doc, 10);
  const rows: string[] = [];
  let step = stepDisplayRow(doc, measure, 1 + 4, 1, 1, null);
  while (step) {
    rows.push(charAt(doc, step.pos));
    step = stepDisplayRow(doc, measure, step.pos, 1, 1, step.x);
  }
  assert.deepEqual(rows, ["l", "m", "q", "\n", "z"]);
});

test("a view without layout yields null so logical lines take over", () => {
  const doc = parseProductMarkdown("abc\n\ndef");
  const flat: RowMeasure = () => ({ left: 0, top: 0, bottom: 0 });
  assert.equal(stepDisplayRow(doc, flat, 1, 1, 1, null), null);
  assert.equal(stepDisplayRow(doc, () => null, 1, 1, 1, null), null);
});
