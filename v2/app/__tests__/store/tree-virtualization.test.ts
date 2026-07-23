import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode } from "../../src/contracts/workspace";
import {
  buildNodeIndex,
  virtualTreeWindow,
  visualTreeIndent,
} from "../../src/store/tree";

test("virtual tree window stays bounded across a 5,000-row projection", () => {
  const first = virtualTreeWindow(5_000, 0, 720, 35);
  const middle = virtualTreeWindow(5_000, 80_000, 720, 35);
  const last = virtualTreeWindow(5_000, 175_000, 720, 35);
  for (const window of [first, middle, last]) {
    assert.equal(window.end - window.start <= 40, true);
    assert.equal(window.totalHeight, 175_000);
    assert.equal(window.offset, window.start * 35);
  }
  assert.equal(first.start, 0);
  assert.equal(last.end, 5_000);
});

test("virtual tree window handles empty and compact viewports", () => {
  assert.deepEqual(virtualTreeWindow(0, 0, 0, 29), {
    start: 0,
    end: 0,
    offset: 0,
    totalHeight: 0,
  });
  const compact = virtualTreeWindow(100, 290, 290, 29);
  assert.equal(compact.start, 2);
  assert.equal(compact.end - compact.start, 26);
});

test("virtual tree window covers tall desktop viewports without becoming node-count bound", () => {
  const tall = virtualTreeWindow(5_000, 70_000, 2_100, 35, 6, 80);
  assert.equal(tall.end - tall.start, 72);
  assert.equal(tall.start <= 2_000, true);
  assert.equal(tall.end > 2_060, true);
});

test("depth 33 keeps exact semantics while visual indentation stays readable", () => {
  const nodes: WorkspaceNode[] = Array.from({ length: 33 }, (_, index) => ({
    id: `folder-${index + 1}`,
    parentId: index === 0 ? null : `folder-${index}`,
    kind: "folder",
    rank: 1,
    title: `Folder ${index + 1}`,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  }));
  const index = buildNodeIndex(nodes);
  assert.equal(index.nodes.get("folder-33")?.depth, 33);
  assert.equal(visualTreeIndent(1, 12, 16, 80), 12);
  assert.equal(visualTreeIndent(6, 12, 16, 80), 80);
  assert.equal(visualTreeIndent(33, 12, 16, 80), 80);
  assert.equal(visualTreeIndent(33, 8, 8, 40), 40);
});
