import type {
  TaskPriority,
  TaskSourceDocument,
  TaskStatus,
  WorkspaceOperation,
  WorkspaceTask,
} from "@skriuw/renderer-core/contracts/workspace";
import { countWords, productSchema, serializeProductMarkdown } from "@/features/editor/schema";
import { nextOccurrenceAttrs, promotedChecklistTaskLinks } from "@/features/editor/tasks";
import { todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { isDueDate } from "@skriuw/renderer-core/tasks/due-dates";
import { isRecurrence } from "@skriuw/renderer-core/tasks/recurrence";
import {
  findCheckItem,
  isJsonNode,
  subtasksOf,
  type JsonNode,
  type SubtaskPath,
} from "@skriuw/renderer-core/tasks/task-document";

export type TaskWriteRefusal =
  | "unknown-task"
  | "note-not-loaded"
  | "block-missing"
  | "block-ambiguous"
  | "document-unreadable"
  | "invalid-date"
  | "invalid-title"
  | "formatted-title"
  | "invalid-field"
  | "no-source"
  | "unknown-subtask";

export type TaskWriteResult =
  | { status: "ready"; operations: WorkspaceOperation[] }
  | { status: "refused"; reason: TaskWriteRefusal; message: string };

export type TaskFieldPatch = {
  priority?: TaskPriority;
  description?: string;
  tagIds?: string[];
};

export type TaskDueChange = {
  taskId: string;
  dueDate: DateKey | null;
};

type CheckItemTransform = (node: JsonNode) => JsonNode;

const MAX_TITLE_BYTES = 512;
const MAX_DESCRIPTION_BYTES = 4_000;
const MAX_TAGS = 32;

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

function patchAttrs(patch: Record<string, unknown>): CheckItemTransform {
  return (node) => ({ ...node, attrs: { ...node.attrs, ...patch } });
}

function rewriteNode(
  value: unknown,
  blockId: string,
  transform: CheckItemTransform,
): { node: unknown; matches: number } {
  if (!isJsonNode(value)) {
    return { node: value, matches: 0 };
  }
  let matches = 0;
  let current: JsonNode = value;
  if (value.type === "check_item" && value.attrs?.blockId === blockId) {
    matches += 1;
    current = transform(value);
  }
  if (Array.isArray(current.content)) {
    const rewritten = current.content.map((child) => rewriteNode(child, blockId, transform));
    const nested = rewritten.reduce((total, entry) => total + entry.matches, 0);
    if (nested > 0) {
      matches += nested;
      current = { ...current, content: rewritten.map((entry) => entry.node) };
    }
  }
  return matches === 0 ? { node: value, matches: 0 } : { node: current, matches };
}

/**
 * Inserts the next occurrence of a repeating item right after it, wherever it
 * sits, mirroring what completing it in the editor does.
 */
function withNextOccurrence(
  value: unknown,
  blockId: string,
  today: DateKey,
): { node: unknown; nextTaskId: string | null } {
  if (!isJsonNode(value) || !Array.isArray(value.content)) {
    return { node: value, nextTaskId: null };
  }
  const content: unknown[] = [];
  let nextTaskId: string | null = null;
  for (const child of value.content) {
    const nested = withNextOccurrence(child, blockId, today);
    content.push(nested.node);
    nextTaskId ??= nested.nextTaskId;
    if (!isJsonNode(child) || child.type !== "check_item" || child.attrs?.blockId !== blockId) {
      continue;
    }
    const attrs = nextOccurrenceAttrs(child.attrs ?? {}, today);
    const line = Array.isArray(child.content) ? child.content[0] : undefined;
    if (attrs === null || line === undefined) continue;
    content.push({ type: "check_item", attrs, content: [line] });
    nextTaskId = typeof attrs.taskId === "string" ? attrs.taskId : null;
  }
  return nextTaskId === null
    ? { node: value, nextTaskId: null }
    : { node: { ...value, content }, nextTaskId };
}

function refuse(reason: TaskWriteRefusal, message: string): TaskWriteResult {
  return { status: "refused", reason, message };
}

type RewrittenDocument =
  | { status: "ready"; document: TaskSourceDocument; nextTaskId: string | null }
  | Extract<TaskWriteResult, { status: "refused" }>;

function rewriteDocument(
  state: RendererState,
  noteId: string,
  edits: readonly { blockId: string; transform: CheckItemTransform }[],
  repeat: { blockId: string; on: DateKey } | null,
): RewrittenDocument {
  const record = state.documents.get(noteId);
  if (!record) {
    return {
      status: "refused",
      reason: "note-not-loaded",
      message: "The source note is not loaded, so it cannot be updated.",
    };
  }
  let json = record.documentJson;
  for (const edit of edits) {
    const { node, matches } = rewriteNode(json, edit.blockId, edit.transform);
    if (matches === 0) {
      return {
        status: "refused",
        reason: "block-missing",
        message: "The source note no longer contains this checklist item.",
      };
    }
    if (matches > 1) {
      return {
        status: "refused",
        reason: "block-ambiguous",
        message:
          "The source note links this task from more than one checklist item. Delete the duplicate to change it here.",
      };
    }
    json = node;
  }
  const repeated =
    repeat === null
      ? { node: json, nextTaskId: null }
      : withNextOccurrence(json, repeat.blockId, repeat.on);
  let document;
  try {
    document = productSchema.nodeFromJSON(repeated.node);
  } catch (error) {
    console.error("task write could not read the source document", error);
    return {
      status: "refused",
      reason: "document-unreadable",
      message: "The source note could not be read.",
    };
  }
  return {
    status: "ready",
    nextTaskId: repeated.nextTaskId,
    document: {
      noteId,
      documentJson: repeated.node,
      markdown: serializeProductMarkdown(document),
      wordCount: countWords(document),
      expectedRevision: record.revision,
    },
  };
}

/**
 * Builds the paired write for a task record change: the record and, for a
 * linked task, the source document rewritten with the same change in one
 * operation, so the next save of that note reconciles to it instead of
 * reverting it. Completing a repeating item also creates the task for its next
 * occurrence in the same batch.
 */
function pairedTaskWrite(
  state: RendererState,
  task: WorkspaceTask,
  transform: CheckItemTransform,
  repeatOn: DateKey | null = null,
): TaskWriteResult {
  if (task.source === null) {
    return { status: "ready", operations: [{ type: "update_task", task, document: null }] };
  }
  const { noteId, blockId } = task.source;
  const rewritten = rewriteDocument(
    state,
    noteId,
    [{ blockId, transform }],
    repeatOn === null ? null : { blockId, on: repeatOn },
  );
  if (rewritten.status === "refused") return rewritten;
  const operations: WorkspaceOperation[] = [
    { type: "update_task", task, document: rewritten.document },
  ];
  const nextTaskId = rewritten.nextTaskId;
  const next =
    nextTaskId === null
      ? undefined
      : promotedChecklistTaskLinks(
          productSchema.nodeFromJSON(rewritten.document.documentJson),
          noteId,
          task.updatedAt,
        ).find((link) => link.taskId === nextTaskId);
  if (next) {
    operations.push({
      type: "create_task",
      task: {
        ...task,
        id: next.taskId,
        title: next.title,
        status: "todo",
        dueDate: next.dueDate,
        source: { noteId, blockId: next.sourceBlockId },
        detachedAt: null,
        createdAt: task.updatedAt,
      },
    });
  }
  return { status: "ready", operations };
}

function recordOnly(task: WorkspaceTask): TaskWriteResult {
  return { status: "ready", operations: [{ type: "update_task", task, document: null }] };
}

/**
 * @name buildTaskStatus
 * @description Sets a task's status. A change that moves the checkbox (to or
 * from done) is a paired write of the record and the source checklist item;
 * completing a repeating task also writes its next occurrence. Moving between
 * to do and in progress leaves the checkbox alone, so only the record changes:
 * the backend keeps an in-progress task in progress while its box stays
 * unchecked.
 *
 * @example
 * const result = buildTaskStatus(store.getState(), "task-1", "in_progress", Date.now());
 */
export function buildTaskStatus(
  state: RendererState,
  taskId: string,
  status: TaskStatus,
  at: number,
  today: DateKey = todayKey(),
): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  const next = { ...task, status, updatedAt: at };
  const checked = status === "done";
  if (checked === (task.status === "done")) {
    return recordOnly(next);
  }
  return pairedTaskWrite(state, next, patchAttrs({ checked }), checked ? today : null);
}

/**
 * @name buildTaskToggle
 * @description Toggles a task's completion: an open task, to do or in
 * progress, completes, and a completed one reopens as to do.
 *
 * @example
 * const result = buildTaskToggle(store.getState(), "task-1", Date.now());
 */
export function buildTaskToggle(
  state: RendererState,
  taskId: string,
  at: number,
  today: DateKey = todayKey(),
): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  return buildTaskStatus(state, taskId, task.status === "done" ? "todo" : "done", at, today);
}

/**
 * @name buildTaskDueDates
 * @description Sets or clears the due dates of one or more tasks. Each source
 * note is rewritten once with every change it carries: the first task of a
 * note brings the document and the rest of that note's tasks follow as
 * record updates, because a second document write in one batch would fail
 * its revision check. Detached tasks change only their record.
 *
 * @example
 * buildTaskDueDates(store.getState(), [{ taskId: "task-1", dueDate: "2026-11-08" }], Date.now());
 */
export function buildTaskDueDates(
  state: RendererState,
  changes: readonly TaskDueChange[],
  at: number,
): TaskWriteResult {
  const byNote = new Map<string, WorkspaceTask[]>();
  const detached: WorkspaceTask[] = [];
  for (const change of changes) {
    const task = state.tasks.get(change.taskId);
    if (!task) {
      return refuse("unknown-task", "That task no longer exists.");
    }
    if (change.dueDate !== null && !isDueDate(change.dueDate)) {
      return refuse("invalid-date", "That is not a calendar date.");
    }
    const next = { ...task, dueDate: change.dueDate, updatedAt: at };
    if (task.source === null) {
      detached.push(next);
    } else {
      byNote.set(task.source.noteId, [...(byNote.get(task.source.noteId) ?? []), next]);
    }
  }
  const operations: WorkspaceOperation[] = [];
  for (const [noteId, tasks] of byNote) {
    const rewritten = rewriteDocument(
      state,
      noteId,
      tasks.map((task) => ({
        blockId: task.source?.blockId ?? "",
        transform: patchAttrs({ dueDate: task.dueDate }),
      })),
      null,
    );
    if (rewritten.status === "refused") return rewritten;
    tasks.forEach((task, index) => {
      operations.push({
        type: "update_task",
        task,
        document: index === 0 ? rewritten.document : null,
      });
    });
  }
  for (const task of detached) {
    operations.push({ type: "update_task", task, document: null });
  }
  return { status: "ready", operations };
}

/**
 * @name buildTaskDueDate
 * @description Sets or clears one task's due date as a paired write of the
 * record and the source checklist item's `dueDate`, which is what the
 * Markdown `📅` token is serialized from.
 *
 * @example
 * buildTaskDueDate(store.getState(), "task-1", "2026-11-09", Date.now());
 */
export function buildTaskDueDate(
  state: RendererState,
  taskId: string,
  dueDate: string | null,
  at: number,
): TaskWriteResult {
  return buildTaskDueDates(state, [{ taskId, dueDate }], at);
}

function plainTitleLine(item: JsonNode): JsonNode | null {
  const line = Array.isArray(item.content) ? item.content[0] : undefined;
  if (!isJsonNode(line) || line.type !== "paragraph") return null;
  const inline = Array.isArray(line.content) ? line.content : [];
  const plain = inline.every(
    (child) =>
      isJsonNode(child) &&
      child.type === "text" &&
      (child.marks === undefined || (Array.isArray(child.marks) && child.marks.length === 0)),
  );
  return plain ? line : null;
}

/**
 * @name buildTaskTitle
 * @description Renames a task and the text of its checklist line in one paired
 * write. A line with links, mentions, or formatting is refused, because
 * replacing it with plain text would lose them.
 *
 * @example
 * buildTaskTitle(store.getState(), "task-1", "Call Patrick back", Date.now());
 */
export function buildTaskTitle(
  state: RendererState,
  taskId: string,
  title: string,
  at: number,
): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  const text = title.replace(/\s+/g, " ").trim();
  if (text.length === 0 || byteLength(text) > MAX_TITLE_BYTES) {
    return refuse("invalid-title", "A task title needs between 1 and 512 bytes of text.");
  }
  if (task.source !== null) {
    const record = state.documents.get(task.source.noteId);
    const item = record ? findCheckItem(record.documentJson, task.source.blockId) : null;
    if (item && plainTitleLine(item) === null) {
      return refuse(
        "formatted-title",
        "This task's line has links or formatting. Rename it in the note to keep them.",
      );
    }
  }
  return pairedTaskWrite(state, { ...task, title: text, updatedAt: at }, (node) => {
    const content = Array.isArray(node.content) ? [...node.content] : [];
    content[0] = { type: "paragraph", content: [{ type: "text", text }] };
    return { ...node, content };
  });
}

/**
 * @name buildTaskFields
 * @description Changes the fields that live only on the task record:
 * priority, notes, and tags. The note's text cannot express them, so no
 * document is written. Tags must name tags that exist in the workspace.
 *
 * @example
 * buildTaskFields(store.getState(), "task-1", { priority: "high" }, Date.now());
 */
export function buildTaskFields(
  state: RendererState,
  taskId: string,
  patch: TaskFieldPatch,
  at: number,
): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  if (patch.description !== undefined && byteLength(patch.description) > MAX_DESCRIPTION_BYTES) {
    return refuse("invalid-field", "Task notes are limited to 4,000 bytes.");
  }
  if (patch.tagIds !== undefined) {
    const unique = new Set(patch.tagIds);
    if (unique.size !== patch.tagIds.length || patch.tagIds.length > MAX_TAGS) {
      return refuse("invalid-field", "A task takes up to 32 different tags.");
    }
    if (patch.tagIds.some((tagId) => !state.tags.has(tagId))) {
      return refuse("invalid-field", "That tag no longer exists.");
    }
  }
  return recordOnly({ ...task, ...patch, updatedAt: at });
}

/**
 * @name buildTaskRecurrence
 * @description Sets or stops a task's repeat rule. The rule lives on the
 * checklist line, so this rewrites the source note; the record is carried
 * unchanged apart from its timestamp.
 *
 * @example
 * buildTaskRecurrence(store.getState(), "task-1", "every week", Date.now());
 */
export function buildTaskRecurrence(
  state: RendererState,
  taskId: string,
  recurrence: string | null,
  at: number,
): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  if (task.source === null) {
    return refuse("no-source", "Only a task with a line in a note can repeat.");
  }
  if (recurrence !== null && !isRecurrence(recurrence)) {
    return refuse("invalid-field", "That is not a repeat rule.");
  }
  return pairedTaskWrite(state, { ...task, updatedAt: at }, patchAttrs({ recurrence }));
}

function readSubtasks(state: RendererState, task: WorkspaceTask) {
  if (task.source === null) return null;
  const record = state.documents.get(task.source.noteId);
  const item = record ? findCheckItem(record.documentJson, task.source.blockId) : null;
  return item ? subtasksOf(item) : null;
}

/**
 * @name buildSubtaskToggle
 * @description Checks or unchecks a checklist item nested under a task. A
 * nested item that is a task of its own is completed through its own record;
 * a plain item is flipped inside the parent's line in a paired write of the
 * parent.
 *
 * @example
 * buildSubtaskToggle(store.getState(), "task-1", { list: 1, item: 0 }, Date.now());
 */
export function buildSubtaskToggle(
  state: RendererState,
  taskId: string,
  path: SubtaskPath,
  at: number,
  today: DateKey = todayKey(),
): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  const subtask = readSubtasks(state, task)?.find(
    (entry) => entry.path.list === path.list && entry.path.item === path.item,
  );
  if (!subtask) {
    return refuse("unknown-subtask", "That subtask is no longer in the note.");
  }
  const own = subtask.taskId === null ? undefined : state.tasks.get(subtask.taskId);
  if (own && own.source?.blockId === subtask.blockId) {
    return buildTaskToggle(state, own.id, at, today);
  }
  return pairedTaskWrite(state, { ...task, updatedAt: at }, (node) => {
    const content = Array.isArray(node.content) ? [...node.content] : [];
    const list = content[path.list];
    if (!isJsonNode(list) || !Array.isArray(list.content)) return node;
    const items = [...list.content];
    const entry = items[path.item];
    if (!isJsonNode(entry)) return node;
    items[path.item] = { ...entry, attrs: { ...entry.attrs, checked: !subtask.done } };
    content[path.list] = { ...list, content: items };
    return { ...node, content };
  });
}

/**
 * @name buildSubtaskAdd
 * @description Adds an unchecked checklist item under a task's line in its
 * note, at the end of its nested checklist.
 *
 * @example
 * buildSubtaskAdd(store.getState(), "task-1", "Book the room", Date.now());
 */
export function buildSubtaskAdd(
  state: RendererState,
  taskId: string,
  title: string,
  at: number,
): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  if (task.source === null) {
    return refuse("no-source", "Only a task with a line in a note can have subtasks.");
  }
  const text = title.replace(/\s+/g, " ").trim();
  if (text.length === 0) {
    return refuse("invalid-title", "A subtask needs some text.");
  }
  const item = {
    type: "check_item",
    attrs: { checked: false, taskId: null, blockId: null, dueDate: null, recurrence: null },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
  return pairedTaskWrite(state, { ...task, updatedAt: at }, (node) => {
    const content = Array.isArray(node.content) ? [...node.content] : [];
    const listIndex = content.findLastIndex(
      (child) => isJsonNode(child) && child.type === "check_list",
    );
    const list = content[listIndex];
    if (listIndex === -1 || !isJsonNode(list) || !Array.isArray(list.content)) {
      content.push({ type: "check_list", content: [item] });
    } else {
      content[listIndex] = { ...list, content: [...list.content, item] };
    }
    return { ...node, content };
  });
}
