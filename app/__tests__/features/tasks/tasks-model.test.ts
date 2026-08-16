import assert from "node:assert/strict";
import test from "node:test";
import {
  UNSOURCED_GROUP_LABEL,
  projectTasks,
  taskGroupsEqual,
} from "../../../src/features/tasks/tasks-model";
import type { TaskSource, WorkspaceTask } from "../../../src/contracts/workspace";
import type { NodeRecord, RendererState } from "../../../src/store/types";

function task(
  id: string,
  overrides: Partial<WorkspaceTask> = {},
): WorkspaceTask {
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

test("tasks group under the title of the note they came from", () => {
  const groups = projectTasks(
    stateWith([task("t1", { source: source("note-a") })], [note("note-a", "Skriuw")]),
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.noteId, "note-a");
  assert.equal(groups[0]?.noteTitle, "Skriuw");
  assert.deepEqual(groups[0]?.rows.map((row) => row.id), ["t1"]);
  assert.equal(groups[0]?.rows[0]?.blockId, "note-a-block");
  assert.equal(groups[0]?.rows[0]?.detached, false);
});

test("two tasks from one note share a group, ordered by creation", () => {
  const groups = projectTasks(
    stateWith(
      [
        task("late", { source: source("note-a"), createdAt: 20 }),
        task("early", { source: source("note-a"), createdAt: 10 }),
      ],
      [note("note-a", "Skriuw")],
    ),
  );

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.rows.map((row) => row.id), ["early", "late"]);
});

test("a task with no source lands in the trailing no-source group", () => {
  const groups = projectTasks(
    stateWith(
      [task("t1", { source: source("note-a") }), task("loose", { detachedAt: 5 })],
      [note("note-a", "Skriuw")],
    ),
  );

  assert.deepEqual(groups.map((group) => group.noteTitle), ["Skriuw", UNSOURCED_GROUP_LABEL]);
  assert.equal(groups[1]?.rows[0]?.detached, true);
  assert.equal(groups[1]?.rows[0]?.noteId, null);
});

test("a task whose source note no longer resolves is kept, not dropped", () => {
  const groups = projectTasks(stateWith([task("orphan", { source: source("purged") })]));

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.noteTitle, UNSOURCED_GROUP_LABEL);
  assert.deepEqual(groups[0]?.rows.map((row) => row.id), ["orphan"]);
  assert.equal(groups[0]?.rows[0]?.noteId, null);
  assert.equal(groups[0]?.rows[0]?.blockId, null);
  assert.equal(groups[0]?.rows[0]?.detached, false);
});

test("groups are ordered deterministically across repeated projections", () => {
  const state = stateWith(
    [
      task("t1", { source: source("note-b") }),
      task("t2", { source: source("note-a") }),
      task("t3", { source: source("note-c") }),
    ],
    [note("note-a", "Alpha"), note("note-b", "Beta"), note("note-c", "Gamma")],
  );

  assert.deepEqual(
    projectTasks(state).map((group) => group.noteTitle),
    ["Alpha", "Beta", "Gamma"],
  );
  assert.deepEqual(projectTasks(state), projectTasks(state));
});

test("completed tasks are marked done and stay in the list", () => {
  const groups = projectTasks(
    stateWith([task("t1", { status: "done", source: source("note-a") })], [note("note-a", "Skriuw")]),
  );

  assert.equal(groups[0]?.rows.length, 1);
  assert.equal(groups[0]?.rows[0]?.done, true);
});

test("taskGroupsEqual holds for structurally identical projections and breaks on a status flip", () => {
  const nodes = [note("note-a", "Skriuw")];
  const before = projectTasks(stateWith([task("t1", { source: source("note-a") })], nodes));
  const same = projectTasks(stateWith([task("t1", { source: source("note-a") })], nodes));
  const after = projectTasks(
    stateWith([task("t1", { status: "done", source: source("note-a") })], nodes),
  );

  assert.equal(taskGroupsEqual(before, same), true);
  assert.equal(taskGroupsEqual(before, after), false);
});

test("an empty task map projects to no groups", () => {
  assert.deepEqual(projectTasks(stateWith([])), []);
});
