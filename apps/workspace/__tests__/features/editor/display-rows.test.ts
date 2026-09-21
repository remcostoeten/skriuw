import assert from "node:assert/strict";
import test from "node:test";
import type { EditorView } from "prosemirror-view";
import { parseProductMarkdown } from "../../../src/features/editor/schema";
import {
  buildDisplayRowLayout,
  createDisplayRowLayoutCache,
  displayRowAt,
  displayRowPosition,
  viewDisplayRowLayout,
} from "../../../src/features/editor/display-rows";
import { allLines, lineOffset } from "../../../src/features/editor/vim/vim-lines";
import type { RowMeasure } from "../../../src/features/editor/vim/vim-rows";
import { CHAR_WIDTH, wrappedLayout } from "./vim/wrapped-layout";

function fakeView(
  doc: ReturnType<typeof parseProductMarkdown>,
  measure: RowMeasure,
  width: number,
): EditorView {
  return {
    state: { doc },
    dom: { clientWidth: width },
    coordsAtPos(pos: number) {
      const rect = measure(pos);
      if (!rect) throw new RangeError("no layout");
      return { ...rect, right: rect.left + CHAR_WIDTH };
    },
  } as unknown as EditorView;
}

test("the layout counts every wrapped row, not every Markdown line", () => {
  const doc = parseProductMarkdown("# Title\n\nabcdefghijklmnopqrstuvwxyz\n\nxy");
  const layout = buildDisplayRowLayout(doc, wrappedLayout(doc, 10));
  assert.deepEqual(layout.counts, [1, 3, 1]);
  assert.deepEqual(layout.starts, [1, 2, 5]);
  assert.equal(layout.total, 5);
});

test("the caret's row is numbered across the whole document", () => {
  const doc = parseProductMarkdown("# Title\n\nabcdefghijklmnopqrstuvwxyz\n\nxy");
  const layout = buildDisplayRowLayout(doc, wrappedLayout(doc, 10));
  const paragraph = 1 + doc.child(0).nodeSize;
  assert.equal(displayRowAt(layout, 1), 1);
  assert.equal(displayRowAt(layout, paragraph + 12), 3);
  assert.equal(displayRowAt(layout, paragraph + 25), 4);
  assert.equal(displayRowAt(layout, doc.content.size - 1), 5);
});

test("a row number lands at the start of that wrapped row and clamps into the document", () => {
  const doc = parseProductMarkdown("# Title\n\nabcdefghijklmnopqrstuvwxyz\n\nxy");
  const layout = buildDisplayRowLayout(doc, wrappedLayout(doc, 10));
  const paragraph = 1 + doc.child(0).nodeSize;
  const row3 = displayRowPosition(layout, 3);
  const row99 = displayRowPosition(layout, 99);
  assert.equal(doc.textBetween(row3, row3 + 1), "k");
  assert.equal(displayRowPosition(layout, 2), paragraph);
  assert.equal(doc.textBetween(row99, row99 + 1), "x");
  assert.equal(displayRowPosition(layout, 0), 1);
});

test("a view without layout still counts one row per line", () => {
  const doc = parseProductMarkdown("abcdefghijklmnopqrstuvwxyz\n\nxy");
  const layout = buildDisplayRowLayout(doc, () => null);
  assert.equal(layout.total, 2);
  assert.equal(displayRowAt(layout, 5), 1);
});

test("inline content taller than the text adds no rows", () => {
  const doc = parseProductMarkdown("abcdefghijklmnopqrstuvwxyz");
  const line = allLines(doc)[0]!;
  const tops = [0, 20, 100];
  const bottoms = [20, 100, 120];
  const tall: RowMeasure = (pos) => {
    if (pos < line.start || pos > line.end) return null;
    const index = lineOffset(line, pos);
    const row = Math.min(2, Math.floor(index / 10));
    return { left: (index % 10) * CHAR_WIDTH, top: tops[row]!, bottom: bottoms[row]! };
  };
  const layout = buildDisplayRowLayout(doc, tall);
  assert.deepEqual(layout.counts, [3]);
  assert.equal(displayRowAt(layout, line.start + 15), 2);
  assert.equal(displayRowPosition(layout, 3), line.start + 20);
});

test("a caret inside a non-text block reports the row that follows it", () => {
  const doc = parseProductMarkdown("# Title\n\n---\n\nabc");
  const layout = buildDisplayRowLayout(doc, wrappedLayout(doc, 10));
  const rulePos = doc.child(0).nodeSize;
  assert.equal(doc.nodeAt(rulePos)?.type.name, "horizontal_rule");
  assert.equal(displayRowAt(layout, rulePos), 2);
  assert.equal(displayRowAt(layout, doc.content.size), 2);
});

test("the cached layout is reused until the document or width changes", () => {
  const cache = createDisplayRowLayoutCache();
  const doc = parseProductMarkdown("abcdefghijklmnopqrstuvwxyz");
  const view = fakeView(doc, wrappedLayout(doc, 10), 400);
  const first = viewDisplayRowLayout(view, cache);
  assert.equal(viewDisplayRowLayout(view, cache), first);
  assert.equal(first.total, 3);

  const narrower = fakeView(doc, wrappedLayout(doc, 5), 200);
  const second = viewDisplayRowLayout(narrower, cache);
  assert.notEqual(second, first);
  assert.equal(second.total, 6);

  const shorter = parseProductMarkdown("ab");
  const edited = fakeView(shorter, wrappedLayout(shorter, 5), 200);
  const third = viewDisplayRowLayout(edited, cache);
  assert.equal(third.doc, shorter);
  assert.equal(third.total, 1);
  assert.ok(displayRowPosition(third, 6) <= shorter.content.size);
});
