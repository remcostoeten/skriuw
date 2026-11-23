import { describe, expect, test } from "vitest";
import { createHarness } from "../harness";

const SEEDS = [
  { id: "work", kind: "folder", title: "Work" },
  {
    id: "sprint",
    kind: "note",
    title: "Sprint",
    parentId: "work",
    markdown: "# Sprint\n\n- [ ] Plain checklist",
  },
] as const;

describe("agent task tools", () => {
  test("create_task without a note makes a standalone task and creates missing tags", async () => {
    const harness = createHarness([...SEEDS]);
    const task = await harness.ok("create_task", {
      title: "Write release notes",
      priority: "high",
      dueDate: "2026-12-01",
      tags: ["release", "Release"],
    });
    expect(task).toMatchObject({
      title: "Write release notes",
      status: "todo",
      priority: "high",
      dueDate: "2026-12-01",
      tags: ["release"],
      note: null,
    });
    expect(harness.references).toHaveLength(1);
    expect(harness.store.getState().tasks.get(task.id)?.source).toBeNull();
  });

  test("create_task with a note appends a tracked checklist line and keeps the given fields", async () => {
    const harness = createHarness([...SEEDS]);
    const task = await harness.ok("create_task", {
      title: "Review PR",
      noteId: "sprint",
      status: "in_progress",
      priority: "urgent",
      dueDate: "2026-11-30",
    });
    expect(task).toMatchObject({
      title: "Review PR",
      status: "in_progress",
      priority: "urgent",
      dueDate: "2026-11-30",
    });
    expect(task.note).toMatchObject({ id: "sprint", path: "Work / Sprint" });
    const read = await harness.ok("read_note", { noteId: "sprint" });
    expect(read.markdown).toContain("Plain checklist");
    expect(read.markdown).toContain("Review PR");
    expect(read.tasks.map((entry: { id: string }) => entry.id)).toEqual([task.id]);
    const promotion = harness.operations.find(
      (operation) => operation.type === "promote_checklist_task",
    );
    expect(promotion).toMatchObject({
      task: { id: task.id, priority: "urgent", status: "in_progress" },
    });
  });

  test("update_task changes several fields and keeps a note task's line in step", async () => {
    const harness = createHarness([...SEEDS]);
    const task = await harness.ok("create_task", { title: "Deploy", noteId: "sprint" });
    const updated = await harness.ok("update_task", {
      taskId: task.id,
      title: "Deploy to production",
      status: "done",
      priority: "low",
      description: "After QA",
    });
    expect(updated).toMatchObject({
      title: "Deploy to production",
      status: "done",
      priority: "low",
      description: "After QA",
    });
    const read = await harness.ok("read_note", { noteId: "sprint" });
    expect(read.markdown).toContain("- [x] Deploy to production");
  });

  test("list_tasks returns open tasks soonest first and filters by folder and tag", async () => {
    const harness = createHarness([...SEEDS]);
    await harness.ok("create_task", { title: "Later", dueDate: "2026-12-20" });
    await harness.ok("create_task", { title: "Soon", dueDate: "2026-12-01", tags: ["ops"] });
    await harness.ok("create_task", { title: "In note", noteId: "sprint" });
    const done = await harness.ok("create_task", { title: "Finished" });
    await harness.ok("update_task", { taskId: done.id, status: "done" });
    const open = await harness.ok("list_tasks");
    expect(open.tasks.map((task: { title: string }) => task.title)).toEqual([
      "Soon",
      "Later",
      "In note",
    ]);
    const inFolder = await harness.ok("list_tasks", { folderId: "work" });
    expect(inFolder.tasks.map((task: { title: string }) => task.title)).toEqual(["In note"]);
    const tagged = await harness.ok("list_tasks", { tag: "OPS" });
    expect(tagged.total).toBe(1);
    const all = await harness.ok("list_tasks", { status: "done" });
    expect(all.tasks.map((task: { title: string }) => task.title)).toEqual(["Finished"]);
  });

  test("delete_task removes standalone tasks and refuses tasks that live in a note", async () => {
    const harness = createHarness([...SEEDS]);
    const loose = await harness.ok("create_task", { title: "Loose" });
    const linked = await harness.ok("create_task", { title: "Linked", noteId: "sprint" });
    await harness.ok("delete_task", { taskId: loose.id });
    expect(harness.store.getState().tasks.has(loose.id)).toBe(false);
    const refused = await harness.call("delete_task", { taskId: linked.id });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("checklist line");
  });

  test("invalid dates and repeat rules are refused before anything is written", async () => {
    const harness = createHarness([...SEEDS]);
    expect((await harness.call("create_task", { title: "x", dueDate: "tomorrow" })).isError).toBe(
      true,
    );
    expect(
      (await harness.call("create_task", { title: "x", recurrence: "every week" })).text,
    ).toContain("noteId");
    expect(harness.operations).toHaveLength(0);
  });
});
