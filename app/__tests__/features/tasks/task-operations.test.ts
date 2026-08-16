import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskToggle } from "../../../src/features/tasks/task-operations";
import {
  countWords,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";
import type { WorkspaceTask } from "../../../src/contracts/workspace";
import type { DocumentRecord, RendererState } from "../../../src/store/types";

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

function checkItem(blockId: string, checked = false, title = "Call Patrick") {
  return {
    type: "check_item",
    attrs: { checked, taskId: "task-1", blockId },
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
