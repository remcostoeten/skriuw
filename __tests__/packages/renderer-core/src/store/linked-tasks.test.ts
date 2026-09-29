import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceTask } from "../../../../../packages/renderer-core/src/contracts/workspace";
import { reconcileLinkedTasks } from "../../../../../packages/renderer-core/src/store/linked-tasks";

function task(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    id: "task-1",
    title: "Ship it",
    status: "todo",
    priority: "medium",
    dueDate: null,
    description: "",
    tagIds: [],
    assigneeIds: [],
    source: { noteId: "note-1", blockId: "block-1" },
    detachedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function item(attrs: Record<string, unknown>, text = "Ship it") {
  return {
    type: "check_item",
    attrs: { checked: false, taskId: "task-1", blockId: "block-1", ...attrs },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function doc(...items: unknown[]) {
  return { type: "doc", content: [{ type: "check_list", content: items }] };
}

function tasksOf(...entries: WorkspaceTask[]): ReadonlyMap<string, WorkspaceTask> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

test("the saved checklist item's title, checkbox, and due date win", () => {
  const next = reconcileLinkedTasks(
    tasksOf(task()),
    "note-1",
    doc(item({ checked: true, dueDate: "2026-10-01" }, "Ship it today")),
    9,
  );

  assert.deepEqual(next.get("task-1"), {
    ...task(),
    title: "Ship it today",
    status: "done",
    dueDate: "2026-10-01",
    updatedAt: 9,
  });
});

test("removing the date in the document clears it on the record", () => {
  const next = reconcileLinkedTasks(
    tasksOf(task({ dueDate: "2026-10-01" })),
    "note-1",
    doc(item({})),
    9,
  );

  assert.equal(next.get("task-1")?.dueDate, null);
});

test("an unchanged document keeps the same task map", () => {
  const tasks = tasksOf(task({ dueDate: "2026-10-01" }));

  assert.equal(
    reconcileLinkedTasks(tasks, "note-1", doc(item({ dueDate: "2026-10-01" })), 9),
    tasks,
  );
  assert.equal(reconcileLinkedTasks(tasks, "note-2", doc(), 9), tasks);
});

test("an in-progress task stays in progress while its box is unchecked", () => {
  const tasks = tasksOf(task({ status: "in_progress" }));

  assert.equal(reconcileLinkedTasks(tasks, "note-1", doc(item({})), 9), tasks);
});

test("a link the document lost or duplicated detaches the task", () => {
  const lost = reconcileLinkedTasks(tasksOf(task()), "note-1", doc(), 9).get("task-1");
  const duplicated = reconcileLinkedTasks(
    tasksOf(task()),
    "note-1",
    doc(item({}), item({ blockId: "block-2" })),
    9,
  ).get("task-1");

  for (const detached of [lost, duplicated]) {
    assert.equal(detached?.source, null);
    assert.equal(detached?.detachedAt, 9);
  }
});

test("a malformed due date attribute reads as no date", () => {
  const next = reconcileLinkedTasks(
    tasksOf(task({ dueDate: "2026-10-01" })),
    "note-1",
    doc(item({ dueDate: "tomorrow" })),
    9,
  );

  assert.equal(next.get("task-1")?.dueDate, null);
});
