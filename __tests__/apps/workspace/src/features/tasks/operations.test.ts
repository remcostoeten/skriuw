import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildSubtaskAdd,
  buildSubtaskToggle,
  buildTaskDueDate,
  buildTaskDueDates,
  buildTaskFields,
  buildTaskRecurrence,
  buildTaskStatus,
  buildTaskTitle,
  buildTaskToggle,
  type TaskWriteResult,
} from "@/features/tasks/operations";
import { countWords, productSchema, serializeProductMarkdown } from "@/features/editor/schema";
import type { WorkspaceOperation, WorkspaceTask } from "@skriuw/renderer-core/contracts/workspace";
import type { DocumentRecord, RendererState } from "@skriuw/renderer-core/store/types";

const AT = 4242;

function task(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    id: "task-1",
    title: "Call Patrick",
    status: "todo",
    priority: "high",
    dueDate: "2026-08-20",
    description: "Ring before noon",
    tagIds: ["tag-1"],
    assigneeIds: ["person-1"],
    source: { noteId: "note-a", blockId: "block-1" },
    detachedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function checkItem(
  blockId: string,
  checked = false,
  title = "Call Patrick",
  dueDate: string | null = null,
) {
  return {
    type: "check_item",
    attrs: { checked, taskId: "task-1", blockId, dueDate },
    content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
  };
}

function documentJson(...items: ReturnType<typeof checkItem>[]) {
  return { type: "doc", content: [{ type: "check_list", content: items }] };
}

function record(json: unknown, revision = 7): DocumentRecord {
  const document = productSchema.nodeFromJSON(json);
  return {
    noteId: "note-a",
    documentJson: json,
    markdown: serializeProductMarkdown(document),
    revision,
    wordCount: countWords(document),
    hasLosslessMarkdown: true,
  };
}

function stateWith(
  tasks: readonly WorkspaceTask[],
  documents: readonly DocumentRecord[] = [],
): RendererState {
  return {
    tasks: new Map(tasks.map((entry) => [entry.id, entry])),
    documents: new Map(documents.map((entry) => [entry.noteId, entry])),
  } as RendererState;
}

function readyToggle(state: RendererState, id = "task-1") {
  const result = buildTaskToggle(state, id, AT);
  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" && result.operations.length, 1);
  const operation = result.status === "ready" ? result.operations[0] : undefined;
  assert.equal(operation?.type, "update_task");
  return operation as Extract<typeof operation, { type: "update_task" }>;
}

function refusal(state: RendererState, id = "task-1") {
  const result = buildTaskToggle(state, id, AT);
  assert.equal(result.status, "refused");
  return result.status === "refused" ? result : undefined;
}

test("toggling a linked task emits the record and the rewritten source document together", () => {
  const operation = readyToggle(stateWith([task()], [record(documentJson(checkItem("block-1")))]));

  assert.equal(operation.task.status, "done");
  assert.equal(operation.task.updatedAt, AT);
  assert.ok(operation.document);
  const rewritten = operation.document!.documentJson as ReturnType<typeof documentJson>;
  assert.equal(rewritten.content[0]?.content?.[0]?.attrs.checked, true);
});

test("the emitted markdown and word count come from the rewritten document", () => {
  const operation = readyToggle(stateWith([task()], [record(documentJson(checkItem("block-1")))]));
  const document = productSchema.nodeFromJSON(operation.document!.documentJson);

  assert.equal(operation.document!.markdown, serializeProductMarkdown(document));
  assert.equal(operation.document!.wordCount, countWords(document));
  assert.match(operation.document!.markdown, /- \[x\]/);
});

test("the emitted document carries the store record's revision", () => {
  const operation = readyToggle(
    stateWith([task()], [record(documentJson(checkItem("block-1")), 12)]),
  );

  assert.equal(operation.document!.noteId, "note-a");
  assert.equal(operation.document!.expectedRevision, 12);
});

test("every field the backend refuses to see drift is passed through unchanged", () => {
  const original = task();
  const operation = readyToggle(
    stateWith([original], [record(documentJson(checkItem("block-1")))]),
  );

  assert.deepEqual(operation.task.source, original.source);
  assert.equal(operation.task.detachedAt, original.detachedAt);
  assert.equal(operation.task.priority, original.priority);
  assert.equal(operation.task.dueDate, original.dueDate);
  assert.equal(operation.task.description, original.description);
  assert.deepEqual(operation.task.tagIds, original.tagIds);
  assert.deepEqual(operation.task.assigneeIds, original.assigneeIds);
  assert.equal(operation.task.title, original.title);
  assert.equal(operation.task.createdAt, original.createdAt);
});

test("unchecking a done task reopens it as todo and unchecks its checklist item", () => {
  const operation = readyToggle(
    stateWith([task({ status: "done" })], [record(documentJson(checkItem("block-1", true)))]),
  );

  assert.equal(operation.task.status, "todo");
  const rewritten = operation.document!.documentJson as ReturnType<typeof documentJson>;
  assert.equal(rewritten.content[0]?.content?.[0]?.attrs.checked, false);
});

test("a detached task toggles as a lone record write", () => {
  const operation = readyToggle(stateWith([task({ source: null, detachedAt: 9 })]));

  assert.equal(operation.document, null);
  assert.equal(operation.task.status, "done");
  assert.equal(operation.task.source, null);
  assert.equal(operation.task.detachedAt, 9);
});

test("a source note with no loaded document refuses the toggle", () => {
  assert.equal(refusal(stateWith([task()]))?.reason, "note-not-loaded");
});

test("a block id that matches nothing in the document refuses the toggle", () => {
  const state = stateWith([task()], [record(documentJson(checkItem("block-other")))]);

  assert.equal(refusal(state)?.reason, "block-missing");
});

test("a duplicated link refuses the toggle and says why", () => {
  const state = stateWith(
    [task()],
    [record(documentJson(checkItem("block-1"), checkItem("block-1")))],
  );
  const refused = refusal(state);

  assert.equal(refused?.reason, "block-ambiguous");
  assert.match(refused!.message, /more than one/);
});

test("an unknown task id refuses the toggle", () => {
  assert.equal(refusal(stateWith([task()]), "missing")?.reason, "unknown-task");
});

test("the source document is left untouched by the rewrite", () => {
  const json = documentJson(checkItem("block-1"));
  readyToggle(stateWith([task()], [record(json)]));

  assert.equal(json.content[0]?.content?.[0]?.attrs.checked, false);
});

function dueDateWrite(state: RendererState, dueDate: string | null) {
  const result = buildTaskDueDate(state, "task-1", dueDate, AT);
  assert.equal(result.status, "ready");
  const operation = result.status === "ready" ? result.operations[0] : undefined;
  assert.equal(operation?.type, "update_task");
  return operation as Extract<typeof operation, { type: "update_task" }>;
}

test("setting a due date writes the record and the checklist item's Markdown token together", () => {
  const operation = dueDateWrite(
    stateWith([task({ dueDate: null })], [record(documentJson(checkItem("block-1")))]),
    "2026-10-01",
  );

  assert.equal(operation.task.dueDate, "2026-10-01");
  assert.equal(operation.task.status, "todo");
  assert.equal(operation.task.updatedAt, AT);
  const rewritten = operation.document!.documentJson as ReturnType<typeof documentJson>;
  assert.equal(rewritten.content[0]?.content?.[0]?.attrs.dueDate, "2026-10-01");
  assert.match(operation.document!.markdown, /- \[ \] Call Patrick .*\u{1F4C5} 2026-10-01$/mu);
});

test("clearing a due date removes the token from the source line", () => {
  const dated = documentJson(checkItem("block-1", false, "Call Patrick", "2026-08-20"));
  const operation = dueDateWrite(stateWith([task()], [record(dated)]), null);

  assert.equal(operation.task.dueDate, null);
  assert.doesNotMatch(operation.document!.markdown, /\u{1F4C5}/u);
});

test("a detached task takes a due date as a lone record write", () => {
  const operation = dueDateWrite(stateWith([task({ source: null, detachedAt: 9 })]), "2026-10-01");

  assert.equal(operation.document, null);
  assert.equal(operation.task.dueDate, "2026-10-01");
});

test("a due date that is not a calendar day is refused", () => {
  const result = buildTaskDueDate(stateWith([task()]), "task-1", "2026-02-30", AT);

  assert.equal(result.status === "refused" && result.reason, "invalid-date");
});

test("a due date change refuses the same document disagreements as a toggle", () => {
  const result = buildTaskDueDate(
    stateWith([task()], [record(documentJson(checkItem("block-other")))]),
    "task-1",
    "2026-10-01",
    AT,
  );

  assert.equal(result.status === "refused" && result.reason, "block-missing");
});

test("completing a repeating task writes the next occurrence and creates its task", () => {
  const repeating = {
    ...checkItem("block-1", false, "Call Patrick", "2026-08-20"),
    attrs: {
      checked: false,
      taskId: "task-1",
      blockId: "block-1",
      dueDate: "2026-08-20",
      recurrence: "every week",
    },
  };
  const state = stateWith([task()], [record(documentJson(repeating))]);
  const result = buildTaskToggle(state, "task-1", AT, "2026-09-30");

  assert.equal(result.status, "ready");
  const operations = result.status === "ready" ? result.operations : [];
  assert.equal(operations.length, 2);
  const [update, create] = operations;
  assert.equal(update?.type, "update_task");
  assert.equal(create?.type, "create_task");
  assert.ok(update?.type === "update_task" && update.document);
  const written = update.document.documentJson as {
    content: { content: { attrs: Record<string, unknown> }[] }[];
  };
  const items = written.content[0]?.content;
  assert.equal(items?.length, 2);
  assert.equal(items?.[0]?.attrs.checked, true);
  assert.equal(items?.[1]?.attrs.checked, false);
  assert.equal(items?.[1]?.attrs.dueDate, "2026-08-27");
  assert.match(update.document.markdown, /\u{1F501} every week \u{1F4C5} 2026-08-27/u);
  if (create?.type !== "create_task") return;
  assert.equal(create.task.id, items?.[1]?.attrs.taskId);
  assert.equal(create.task.status, "todo");
  assert.equal(create.task.dueDate, "2026-08-27");
  assert.equal(create.task.title, "Call Patrick");
  assert.deepEqual(create.task.source, { noteId: "note-a", blockId: items?.[1]?.attrs.blockId });
  assert.equal(create.task.priority, "high");
});

test("reopening a repeating task does not create another", () => {
  const repeating = {
    ...checkItem("block-1", true),
    attrs: { checked: true, taskId: "task-1", blockId: "block-1", recurrence: "every week" },
  };
  const state = stateWith([task({ status: "done" })], [record(documentJson(repeating))]);
  const result = buildTaskToggle(state, "task-1", AT, "2026-09-30");

  assert.equal(result.status === "ready" && result.operations.length, 1);
});

type UpdateTask = Extract<WorkspaceOperation, { type: "update_task" }>;

function updates(result: TaskWriteResult): UpdateTask[] {
  assert.equal(result.status, "ready", result.status === "refused" ? result.message : "");
  return result.status === "ready"
    ? result.operations.filter(
        (operation): operation is UpdateTask => operation.type === "update_task",
      )
    : [];
}

function writtenItems(operation: UpdateTask | undefined) {
  const json = operation?.document?.documentJson as {
    content: { content: { attrs: Record<string, unknown>; content: any[] }[] }[];
  };
  return json.content[0]?.content ?? [];
}

function reason(result: TaskWriteResult): string | null {
  return result.status === "refused" ? result.reason : null;
}

function withTags(state: RendererState, ...ids: string[]): RendererState {
  return {
    ...state,
    tags: new Map(
      ids.map((id) => [
        id,
        { id, name: id, color: null, createdAt: 1, updatedAt: 1, createdIn: null },
      ]),
    ),
  } as RendererState;
}

test("moving a task into progress changes only the record and leaves the checkbox alone", () => {
  const state = stateWith([task()], [record(documentJson(checkItem("block-1")))]);
  const [operation] = updates(buildTaskStatus(state, "task-1", "in_progress", AT));

  assert.equal(operation?.task.status, "in_progress");
  assert.equal(operation?.document, null);
});

test("reopening a done task into progress unchecks its line in the same write", () => {
  const state = stateWith(
    [task({ status: "done" })],
    [record(documentJson(checkItem("block-1", true)))],
  );
  const [operation] = updates(buildTaskStatus(state, "task-1", "in_progress", AT));

  assert.equal(operation?.task.status, "in_progress");
  assert.equal(writtenItems(operation)[0]?.attrs.checked, false);
});

test("completing an in-progress task checks its line", () => {
  const state = stateWith(
    [task({ status: "in_progress" })],
    [record(documentJson(checkItem("block-1")))],
  );
  const [operation] = updates(buildTaskToggle(state, "task-1", AT));

  assert.equal(operation?.task.status, "done");
  assert.equal(writtenItems(operation)[0]?.attrs.checked, true);
});

test("renaming a task rewrites its checklist text and the record together", () => {
  const state = stateWith([task()], [record(documentJson(checkItem("block-1")))]);
  const [operation] = updates(buildTaskTitle(state, "task-1", "  Call   Patrick back ", AT));

  assert.equal(operation?.task.title, "Call Patrick back");
  assert.deepEqual(writtenItems(operation)[0]?.content[0], {
    type: "paragraph",
    content: [{ type: "text", text: "Call Patrick back" }],
  });
  assert.match(operation!.document!.markdown, /- \[ \] Call Patrick back/);
});

test("a rename keeps nested subtasks under the line", () => {
  const item = {
    ...checkItem("block-1"),
    content: [
      ...checkItem("block-1").content,
      { type: "check_list", content: [checkItem("block-2", false, "Nested")] },
    ],
  };
  const state = stateWith([task()], [record(documentJson(item))]);
  const [operation] = updates(buildTaskTitle(state, "task-1", "Renamed", AT));

  assert.equal(writtenItems(operation)[0]?.content.length, 2);
});

test("a line with formatting refuses a rename instead of flattening it", () => {
  const formatted = {
    ...checkItem("block-1"),
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Call Patrick", marks: [{ type: "strong" }] }],
      },
    ],
  };
  const result = buildTaskTitle(
    stateWith([task()], [record(documentJson(formatted))]),
    "task-1",
    "Call",
    AT,
  );

  assert.equal(result.status === "refused" && result.reason, "formatted-title");
});

test("an empty title is refused", () => {
  const result = buildTaskTitle(stateWith([task({ source: null })]), "task-1", "   ", AT);

  assert.equal(result.status === "refused" && result.reason, "invalid-title");
});

test("priority, notes, and tags are record-only writes", () => {
  const state = withTags(
    stateWith([task()], [record(documentJson(checkItem("block-1")))]),
    "tag-1",
    "tag-2",
  );
  const [operation] = updates(
    buildTaskFields(
      state,
      "task-1",
      { priority: "urgent", description: "Soon", tagIds: ["tag-2"] },
      AT,
    ),
  );

  assert.equal(operation?.document, null);
  assert.equal(operation?.task.priority, "urgent");
  assert.equal(operation?.task.description, "Soon");
  assert.deepEqual(operation?.task.tagIds, ["tag-2"]);
  assert.equal(operation?.task.updatedAt, AT);
});

test("a tag that does not exist in the workspace is refused", () => {
  const result = buildTaskFields(
    withTags(stateWith([task()]), "tag-1"),
    "task-1",
    { tagIds: ["nope"] },
    AT,
  );

  assert.equal(result.status === "refused" && result.reason, "invalid-field");
});

test("notes over the backend's limit are refused", () => {
  const result = buildTaskFields(
    stateWith([task()]),
    "task-1",
    { description: "x".repeat(4_001) },
    AT,
  );

  assert.equal(result.status === "refused" && result.reason, "invalid-field");
});

test("moving several tasks of one note writes that note once", () => {
  const second = task({ id: "task-2", source: { noteId: "note-a", blockId: "block-2" } });
  const other = {
    ...checkItem("block-2"),
    attrs: { ...checkItem("block-2").attrs, taskId: "task-2" },
  };
  const loose = task({ id: "task-3", source: null, detachedAt: 3 });
  const state = stateWith(
    [task(), second, loose],
    [record(documentJson(checkItem("block-1"), other))],
  );
  const operations = updates(
    buildTaskDueDates(
      state,
      [
        { taskId: "task-1", dueDate: "2026-11-08" },
        { taskId: "task-2", dueDate: "2026-11-08" },
        { taskId: "task-3", dueDate: "2026-11-08" },
      ],
      AT,
    ),
  );

  assert.equal(operations.length, 3);
  assert.ok(operations[0]?.document);
  assert.equal(operations[1]?.document, null);
  assert.equal(operations[2]?.document, null);
  assert.deepEqual(
    writtenItems(operations[0]).map((item) => item.attrs.dueDate),
    ["2026-11-08", "2026-11-08"],
  );
  assert.ok(operations.every((operation) => operation.task.dueDate === "2026-11-08"));
});

test("a repeat rule is written to the line and can be stopped", () => {
  const state = stateWith([task()], [record(documentJson(checkItem("block-1")))]);
  const [set] = updates(buildTaskRecurrence(state, "task-1", "every 2 weeks", AT));

  assert.equal(writtenItems(set)[0]?.attrs.recurrence, "every 2 weeks");
  assert.match(set!.document!.markdown, /\u{1F501} every 2 weeks/u);

  const repeating = stateWith(
    [task()],
    [record({ type: "doc", content: [{ type: "check_list", content: writtenItems(set) }] })],
  );
  const [stopped] = updates(buildTaskRecurrence(repeating, "task-1", null, AT));
  assert.equal(writtenItems(stopped)[0]?.attrs.recurrence, null);
});

test("a rule outside the canonical spelling and a detached task are refused", () => {
  const state = stateWith(
    [task(), task({ id: "loose", source: null })],
    [record(documentJson(checkItem("block-1")))],
  );

  assert.equal(
    reason(buildTaskRecurrence(state, "task-1", "every fortnight", AT)),
    "invalid-field",
  );
  assert.equal(reason(buildTaskRecurrence(state, "loose", "every week", AT)), "no-source");
});

function withSubtasks(
  ...subtasks: { text: string; checked: boolean; taskId?: string; blockId?: string }[]
) {
  return {
    ...checkItem("block-1"),
    content: [
      ...checkItem("block-1").content,
      {
        type: "check_list",
        content: subtasks.map((subtask) => ({
          type: "check_item",
          attrs: {
            checked: subtask.checked,
            taskId: subtask.taskId ?? null,
            blockId: subtask.blockId ?? null,
          },
          content: [{ type: "paragraph", content: [{ type: "text", text: subtask.text }] }],
        })),
      },
    ],
  };
}

test("a plain subtask flips inside its parent's line", () => {
  const state = stateWith(
    [task()],
    [
      record(
        documentJson(withSubtasks({ text: "One", checked: false }, { text: "Two", checked: true })),
      ),
    ],
  );
  const [operation] = updates(buildSubtaskToggle(state, "task-1", { list: 1, item: 1 }, AT));

  assert.equal(operation?.task.id, "task-1");
  const nested = writtenItems(operation)[0]?.content[1]?.content;
  assert.equal(nested?.[0]?.attrs.checked, false);
  assert.equal(nested?.[1]?.attrs.checked, false);
});

test("a subtask that is its own task completes through its own record", () => {
  const child = task({
    id: "task-2",
    title: "Child",
    source: { noteId: "note-a", blockId: "block-2" },
  });
  const state = stateWith(
    [task(), child],
    [
      record(
        documentJson(
          withSubtasks({ text: "Child", checked: false, taskId: "task-2", blockId: "block-2" }),
        ),
      ),
    ],
  );
  const [operation] = updates(buildSubtaskToggle(state, "task-1", { list: 1, item: 0 }, AT));

  assert.equal(operation?.task.id, "task-2");
  assert.equal(operation?.task.status, "done");
});

test("a subtask path that is gone is refused", () => {
  const state = stateWith([task()], [record(documentJson(checkItem("block-1")))]);
  const result = buildSubtaskToggle(state, "task-1", { list: 1, item: 0 }, AT);

  assert.equal(result.status === "refused" && result.reason, "unknown-subtask");
});

test("adding a subtask appends an unchecked item under the line", () => {
  const first = stateWith([task()], [record(documentJson(checkItem("block-1")))]);
  const [created] = updates(buildSubtaskAdd(first, "task-1", " Book the room ", AT));
  const nested = writtenItems(created)[0]?.content[1];

  assert.equal(nested?.type, "check_list");
  assert.equal(nested?.content[0]?.attrs.checked, false);
  assert.equal(nested?.content[0]?.content[0]?.content[0]?.text, "Book the room");
  assert.match(created!.document!.markdown, /\n  - \[ \] Book the room/);

  const second = stateWith(
    [task()],
    [record(documentJson(withSubtasks({ text: "One", checked: false })))],
  );
  const [appended] = updates(buildSubtaskAdd(second, "task-1", "Two", AT));
  assert.equal(writtenItems(appended)[0]?.content[1]?.content.length, 2);
});
