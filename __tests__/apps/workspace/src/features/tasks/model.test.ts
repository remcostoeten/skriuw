import assert from "node:assert/strict";
import { test } from "vitest";
import {
  applyTaskOverlay,
  filterTaskRows,
  groupTasks,
  oldestLateness,
  projectTaskRows,
  summarizeTasks,
  taskRowsEqual,
  upcomingWeek,
  visibleRowIds,
  type TaskGroup,
} from "@/features/tasks/model";
import type { TaskSource, WorkspaceTask } from "@skriuw/renderer-core/contracts/workspace";
import type { DocumentRecord, NodeRecord, RendererState } from "@skriuw/renderer-core/store/types";

const TODAY = "2026-09-30";
const TODAY_NOON = new Date(2026, 8, 30, 12).getTime();
const YESTERDAY_NOON = new Date(2026, 8, 29, 12).getTime();

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

function node(id: string, title: string, parentId: string | null = null): NodeRecord {
  return {
    id,
    parentId,
    kind: parentId === null && id.startsWith("folder") ? "folder" : "note",
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
  documents: readonly DocumentRecord[] = [],
): RendererState {
  return {
    tasks: new Map(tasks.map((entry) => [entry.id, entry])),
    nodes: new Map(nodes.map((entry) => [entry.id, entry])),
    documents: new Map(documents.map((entry) => [entry.noteId, entry])),
    tags: new Map([
      [
        "tag-a",
        { id: "tag-a", name: "home", color: null, createdAt: 1, updatedAt: 1, createdIn: null },
      ],
    ]),
  } as RendererState;
}

function rows(state: RendererState) {
  return projectTaskRows(state);
}

function titles(groups: readonly TaskGroup[]): string[] {
  return groups.map((group) => group.title);
}

function ids(groups: readonly TaskGroup[], index: number): string[] {
  return groups[index]?.rows.map((row) => row.id) ?? [];
}

test("by due date, open work falls into Overdue, Today, Upcoming, and No date", () => {
  const groups = groupTasks(
    rows(
      stateWith([
        task("none"),
        task("later", { dueDate: "2026-10-04" }),
        task("now", { dueDate: TODAY }),
        task("late", { dueDate: "2026-09-12" }),
      ]),
    ),
    "due",
    TODAY,
  );

  assert.deepEqual(titles(groups), ["Overdue", "Today", "Upcoming", "No date"]);
  assert.deepEqual(
    groups.map((group) => group.rows.map((row) => row.id)),
    [["late"], ["now"], ["later"], ["none"]],
  );
});

test("work done today and due today stays in Today; other done work moves to Completed", () => {
  const groups = groupTasks(
    rows(
      stateWith([
        task("today-open", { dueDate: TODAY, createdAt: 1 }),
        task("today-done", { dueDate: TODAY, status: "done", createdAt: 2 }),
        task("past-done", { dueDate: "2026-09-01", status: "done", updatedAt: 5 }),
        task("future-done", { dueDate: "2026-10-09", status: "done", updatedAt: 9 }),
        task("undated-done", { status: "done", updatedAt: 7 }),
      ]),
    ),
    "due",
    TODAY,
  );

  assert.deepEqual(titles(groups), ["Today", "Completed"]);
  assert.deepEqual(ids(groups, 0), ["today-open", "today-done"]);
  assert.deepEqual(ids(groups, 1), ["future-done", "undated-done", "past-done"]);
});

test("a task that was just completed keeps its place while it settles", () => {
  const state = stateWith([task("t1", { dueDate: "2026-10-02", status: "done" })]);

  assert.deepEqual(titles(groupTasks(rows(state), "due", TODAY, new Set(["t1"]))), ["Upcoming"]);
  assert.deepEqual(titles(groupTasks(rows(state), "due", TODAY)), ["Completed"]);
  assert.deepEqual(titles(groupTasks(rows(state), "note", TODAY, new Set(["t1"]))), ["Detached"]);
});

test("by note, open work groups per source note by earliest date, then Detached, then Completed", () => {
  const state = stateWith(
    [
      task("a1", { source: source("note-a"), dueDate: "2026-10-05" }),
      task("b1", { source: source("note-b", "b1"), dueDate: "2026-10-01" }),
      task("b2", { source: source("note-b", "b2") }),
      task("c1", { source: source("note-c") }),
      task("loose", { detachedAt: 4 }),
      task("orphan", { source: source("purged") }),
      task("done", { source: source("note-a", "d"), status: "done" }),
    ],
    [
      node("note-a", "Alpha"),
      node("note-b", "Beta", "folder-x"),
      node("note-c", "Gamma"),
      node("folder-x", "Work"),
    ],
  );
  const groups = groupTasks(rows(state), "note", TODAY);

  assert.deepEqual(titles(groups), ["Beta", "Alpha", "Gamma", "Detached", "Completed"]);
  assert.deepEqual(ids(groups, 0), ["b1", "b2"]);
  assert.equal(groups[0]?.folderTitle, "Work");
  assert.equal(groups[0]?.noteId, "note-b");
  assert.deepEqual(ids(groups, 3).sort(), ["loose", "orphan"]);
  assert.deepEqual(ids(groups, 4), ["done"]);
});

test("a row knows how it is linked and never offers a dead jump", () => {
  const all = rows(
    stateWith(
      [
        task("linked", { source: source("note-a") }),
        task("loose", { detachedAt: 5 }),
        task("orphan", { source: source("purged") }),
        task("quick"),
      ],
      [node("note-a", "")],
    ),
  );
  const byId = new Map(all.map((row) => [row.id, row]));

  assert.equal(byId.get("linked")?.link, "linked");
  assert.equal(byId.get("linked")?.noteTitle, "Untitled");
  assert.equal(byId.get("linked")?.blockId, "note-a-block");
  assert.equal(byId.get("loose")?.link, "detached");
  assert.equal(byId.get("orphan")?.link, "orphaned");
  assert.equal(byId.get("orphan")?.noteId, null);
  assert.equal(byId.get("quick")?.link, "none");
});

test("rows read the repeat rule and subtask counts from the source line", () => {
  const documentJson = {
    type: "doc",
    content: [
      {
        type: "check_list",
        content: [
          {
            type: "check_item",
            attrs: { checked: false, taskId: "t1", blockId: "b1", recurrence: "every week" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Parent" }] },
              {
                type: "check_list",
                content: [
                  {
                    type: "check_item",
                    attrs: { checked: true },
                    content: [{ type: "paragraph" }],
                  },
                  {
                    type: "check_item",
                    attrs: { checked: false },
                    content: [{ type: "paragraph" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const document = {
    noteId: "note-a",
    documentJson,
    markdown: "",
    revision: 1,
    wordCount: 1,
    hasLosslessMarkdown: true,
  };
  const [row] = rows(
    stateWith(
      [task("t1", { source: source("note-a", "b1"), tagIds: ["tag-a", "gone"] })],
      [node("note-a", "Alpha")],
      [document],
    ),
  );

  assert.equal(row?.recurrence, "every week");
  assert.equal(row?.subtasksDone, 1);
  assert.equal(row?.subtasksTotal, 2);
  assert.deepEqual(row?.tags, ["home"]);
});

test("a malformed stored due date reads as no date", () => {
  const groups = groupTasks(rows(stateWith([task("t1", { dueDate: "someday" })])), "due", TODAY);

  assert.deepEqual(titles(groups), ["No date"]);
  assert.equal(groups[0]?.rows[0]?.dueDate, null);
});

test("the row selector's equality breaks on any shown change", () => {
  const before = rows(stateWith([task("t1")]));

  assert.equal(taskRowsEqual(before, rows(stateWith([task("t1")]))), true);
  assert.equal(taskRowsEqual(before, rows(stateWith([task("t1", { status: "done" })]))), false);
  assert.equal(taskRowsEqual(before, rows(stateWith([task("t1", { priority: "high" })]))), false);
  assert.equal(taskRowsEqual(before, rows(stateWith([task("t1", { description: "x" })]))), false);
});

test("an overlay draws a pending change over the stored row", () => {
  const stored = rows(stateWith([task("t1", { dueDate: "2026-10-01" })]));
  const [shown] = applyTaskOverlay(
    stored,
    new Map([["t1", { status: "done", dueDate: null, title: "New" }]]),
  );

  assert.equal(shown?.done, true);
  assert.equal(shown?.dueDate, null);
  assert.equal(shown?.title, "New");
  assert.equal(applyTaskOverlay(stored, new Map())[0], stored[0]);
});

test("the filter matches every word across title, note, repeat rule, tags, and notes", () => {
  const all = rows(
    stateWith(
      [
        task("a", { title: "Water plants", source: source("note-a") }),
        task("b", { title: "Call mum", description: "About the weekend", tagIds: ["tag-a"] }),
      ],
      [node("note-a", "Home chores")],
    ),
  );

  assert.deepEqual(
    filterTaskRows(all, "water CHORES").map((row) => row.id),
    ["a"],
  );
  assert.deepEqual(
    filterTaskRows(all, "weekend home").map((row) => row.id),
    ["b"],
  );
  assert.deepEqual(filterTaskRows(all, "nothing"), []);
  assert.equal(filterTaskRows(all, "  "), all);
});

test("the summary counts open, overdue, and today's completions", () => {
  const summary = summarizeTasks(
    rows(
      stateWith([
        task("open"),
        task("late", { dueDate: "2026-09-01" }),
        task("done-today", { status: "done", updatedAt: TODAY_NOON }),
        task("done-before", { status: "done", updatedAt: YESTERDAY_NOON }),
      ]),
    ),
    TODAY,
  );

  assert.deepEqual(summary, { open: 2, overdue: 1, doneToday: 1 });
});

test("the week strip counts open work on each of the next seven days", () => {
  const week = upcomingWeek(
    rows(
      stateWith([
        task("a", { dueDate: "2026-10-01" }),
        task("b", { dueDate: "2026-10-01" }),
        task("c", { dueDate: "2026-10-01", status: "done" }),
        task("d", { dueDate: "2026-10-08" }),
      ]),
    ),
    TODAY,
  );

  assert.equal(week.length, 7);
  assert.deepEqual(week[0], { dueDate: "2026-10-01", count: 2 });
  assert.equal(week.at(-1)?.dueDate, "2026-10-07");
  assert.equal(
    week.reduce((total, day) => total + day.count, 0),
    2,
  );
});

test("the oldest lateness ignores completed work", () => {
  const all = rows(
    stateWith([
      task("a", { dueDate: "2026-09-27" }),
      task("b", { dueDate: "2026-09-01", status: "done" }),
    ]),
  );

  assert.equal(oldestLateness(all, TODAY), 3);
});

test("visible ids skip the folded completed rows until the group is expanded", () => {
  const groups = groupTasks(
    rows(
      stateWith([
        task("open"),
        ...[1, 2, 3, 4, 5].map((index) =>
          task(`done-${index}`, { status: "done", updatedAt: index }),
        ),
      ]),
    ),
    "due",
    TODAY,
  );

  assert.deepEqual(visibleRowIds(groups, false), ["open", "done-5", "done-4", "done-3"]);
  assert.equal(visibleRowIds(groups, true).length, 6);
});

test("an empty task map projects to no groups", () => {
  assert.deepEqual(groupTasks(rows(stateWith([])), "due", TODAY), []);
  assert.deepEqual(groupTasks(rows(stateWith([])), "note", TODAY), []);
});
