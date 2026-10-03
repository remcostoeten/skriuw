import assert from "node:assert/strict";
import { test } from "vitest";
import { projectTasks, taskGroupsEqual } from "@/features/tasks/model";
import type { TaskSource, WorkspaceTask } from "@skriuw/renderer-core/contracts/workspace";
import type { NodeRecord, RendererState } from "@skriuw/renderer-core/store/types";

function task(id: string, overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    id,
    title: `Task ${id}`,
    status: "todo",
    priority: "medium",
    dueDate: null,
    description: "",
    tagIds: [],
    assigneeIds: [],
    source: null,
    detachedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function source(noteId: string, blockId = `${noteId}-block`): TaskSource {
  return { noteId, blockId };
}

function note(id: string, title: string): NodeRecord {
  return {
    id,
    parentId: null,
    kind: "note",
    title,
    depth: 0,
    setSize: 1,
    posInSet: 1,
    descendantCount: 0,
  };
}

function stateWith(
  tasks: readonly WorkspaceTask[],
  nodes: readonly NodeRecord[] = [],
): RendererState {
  return {
    tasks: new Map(tasks.map((entry) => [entry.id, entry])),
    nodes: new Map(nodes.map((entry) => [entry.id, entry])),
  } as RendererState;
}

const TODAY = "2026-09-30";

function labels(groups: ReturnType<typeof projectTasks>): string[] {
  return groups.map((group) => group.label);
}

function ids(groups: ReturnType<typeof projectTasks>, index: number): string[] {
  return groups[index]?.rows.map((row) => row.id) ?? [];
}

test("tasks group by due date in a fixed order", () => {
  const groups = projectTasks(
    stateWith([
      task("none"),
      task("later", { dueDate: "2026-10-04" }),
      task("now", { dueDate: TODAY }),
      task("late", { dueDate: "2026-09-12" }),
    ]),
    TODAY,
  );

  assert.deepEqual(labels(groups), ["Overdue", "Today", "Upcoming", "No date"]);
  assert.deepEqual(
    groups.map((group) => group.rows.map((row) => row.id)),
    [["late"], ["now"], ["later"], ["none"]],
  );
});

test("only open work is overdue; completed past work moves to the end", () => {
  const groups = projectTasks(
    stateWith([
      task("open", { dueDate: "2026-09-01" }),
      task("closed", { dueDate: "2026-09-01", status: "done" }),
    ]),
    TODAY,
  );

  assert.deepEqual(labels(groups), ["Overdue", "Completed earlier"]);
  assert.deepEqual(ids(groups, 1), ["closed"]);
  assert.equal(groups[1]?.rows[0]?.done, true);
});

test("completed tasks due today or later keep their date group", () => {
  const groups = projectTasks(
    stateWith([
      task("today", { dueDate: TODAY, status: "done" }),
      task("undated", { status: "done" }),
    ]),
    TODAY,
  );

  assert.deepEqual(labels(groups), ["Today", "No date"]);
  assert.equal(groups[0]?.rows[0]?.done, true);
});

test("the same record moves from Upcoming to Today to Overdue as days pass", () => {
  const state = stateWith([task("t1", { dueDate: "2026-10-01" })]);

  assert.deepEqual(labels(projectTasks(state, TODAY)), ["Upcoming"]);
  assert.deepEqual(labels(projectTasks(state, "2026-10-01")), ["Today"]);
  assert.deepEqual(labels(projectTasks(state, "2026-10-02")), ["Overdue"]);
});

test("rows run by date, then source note, then creation", () => {
  const groups = projectTasks(
    stateWith(
      [
        task("beta", { source: source("note-b"), dueDate: "2026-10-03" }),
        task("alpha-late", { source: source("note-a"), dueDate: "2026-10-03", createdAt: 20 }),
        task("alpha-early", { source: source("note-a"), dueDate: "2026-10-03", createdAt: 10 }),
        task("loose", { dueDate: "2026-10-03", detachedAt: 5 }),
        task("sooner", { source: source("note-b"), dueDate: "2026-10-02" }),
      ],
      [note("note-a", "Alpha"), note("note-b", "Beta")],
    ),
    TODAY,
  );

  assert.deepEqual(ids(groups, 0), ["sooner", "alpha-early", "alpha-late", "beta", "loose"]);
});

test("a row keeps its source note for the jump and marks work with none", () => {
  const groups = projectTasks(
    stateWith(
      [
        task("linked", { source: source("note-a") }),
        task("loose", { detachedAt: 5 }),
        task("orphan", { source: source("purged") }),
      ],
      [note("note-a", "Skriuw")],
    ),
    TODAY,
  );
  const rows = new Map(groups[0]?.rows.map((row) => [row.id, row]));

  assert.equal(rows.get("linked")?.noteTitle, "Skriuw");
  assert.equal(rows.get("linked")?.blockId, "note-a-block");
  assert.equal(rows.get("loose")?.detached, true);
  assert.equal(rows.get("loose")?.noteId, null);
  assert.equal(rows.get("orphan")?.noteId, null);
  assert.equal(rows.get("orphan")?.detached, false);
});

test("a malformed stored due date reads as no date", () => {
  const groups = projectTasks(stateWith([task("t1", { dueDate: "someday" })]), TODAY);

  assert.deepEqual(labels(groups), ["No date"]);
  assert.equal(groups[0]?.rows[0]?.dueDate, null);
});

test("taskGroupsEqual holds for identical projections and breaks on a status or date change", () => {
  const before = projectTasks(stateWith([task("t1")]), TODAY);
  const same = projectTasks(stateWith([task("t1")]), TODAY);
  const done = projectTasks(stateWith([task("t1", { status: "done" })]), TODAY);
  const dated = projectTasks(stateWith([task("t1", { dueDate: "2026-12-01" })]), TODAY);

  assert.equal(taskGroupsEqual(before, same), true);
  assert.equal(taskGroupsEqual(before, done), false);
  assert.equal(taskGroupsEqual(before, dated), false);
});

test("an empty task map projects to no groups", () => {
  assert.deepEqual(projectTasks(stateWith([]), TODAY), []);
});
