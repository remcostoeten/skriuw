import assert from "node:assert/strict";
import { test } from "vitest";
import {
  checkItemFacts,
  findCheckItem,
  subtasksOf,
  taskContextLines,
} from "@/features/tasks/task-document";

function item(blockId: string | null, checked: boolean, text: string, nested: unknown[] = []) {
  return {
    type: "check_item",
    attrs: { checked, taskId: blockId ? `task-${blockId}` : null, blockId, recurrence: null },
    content: [
      { type: "paragraph", content: [{ type: "text", text }] },
      ...(nested.length > 0 ? [{ type: "check_list", content: nested }] : []),
    ],
  };
}

const parent = item("b1", false, "Parent", [
  item(null, true, "First"),
  item("b2", false, "Second"),
]);

const documentJson = { type: "doc", content: [{ type: "check_list", content: [parent] }] };

test("a check item is found by block id, and a duplicated one is not", () => {
  assert.equal(findCheckItem(documentJson, "b1"), parent);
  assert.equal(findCheckItem(documentJson, "missing"), null);
  const doubled = { type: "doc", content: [{ type: "check_list", content: [parent, parent] }] };
  assert.equal(findCheckItem(doubled, "b1"), null);
});

test("subtasks are the direct nested items with their paths", () => {
  assert.deepEqual(subtasksOf(parent), [
    { path: { list: 1, item: 0 }, title: "First", done: true, taskId: null, blockId: null },
    { path: { list: 1, item: 1 }, title: "Second", done: false, taskId: "task-b2", blockId: "b2" },
  ]);
});

test("facts are indexed once per document object", () => {
  const facts = checkItemFacts(documentJson, "b1");
  assert.deepEqual(facts.subtasks, { done: 1, total: 2 });
  assert.equal(checkItemFacts(documentJson, "b1"), facts);
  assert.equal(checkItemFacts(documentJson, "nope").subtasks.total, 0);
  assert.equal(checkItemFacts(null, "b1").recurrence, null);
});

test("context lines number the note's Markdown and mark the task with its nested lines", () => {
  const markdown = [
    "# Plan",
    "",
    "Intro",
    "- [ ] Other <!--skriuw-task:t0:b0-->",
    "- [ ] Parent <!--skriuw-task:t1:b1--> 📅 2026-10-01",
    "  - [x] First",
    "- [ ] After",
    "",
    "Tail",
    "More",
  ].join("\n");
  const lines = taskContextLines(markdown, "t1");

  assert.deepEqual(
    lines.map((line) => line.number),
    [2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.deepEqual(
    lines.filter((line) => line.current).map((line) => line.text),
    ["- [ ] Parent 📅 2026-10-01", "  - [x] First"],
  );
  assert.equal(lines.find((line) => line.number === 4)?.text, "- [ ] Other");
  assert.deepEqual(taskContextLines(markdown, "t9"), []);
  assert.equal(taskContextLines("## Head\n- [ ] A <!--skriuw-task:t1-->", "t1")[0]?.heading, true);
});
