import type { Node as ProseMirrorNode } from "prosemirror-model";
import type {
  TaskPriority,
  TaskStatus,
  WorkspaceOperation,
  WorkspaceTask,
} from "@skriuw/renderer-core/contracts/workspace";
import type { ReferenceOperation } from "@skriuw/renderer-core/references/types";
import { normalizeEntityName } from "@skriuw/renderer-core/search/query-parser";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { isDueDate } from "@skriuw/renderer-core/tasks/due-dates";
import { isRecurrence } from "@skriuw/renderer-core/tasks/recurrence";
import { productSchema } from "@/features/editor/schema";
import { taskCheckItemAttrs } from "@/features/editor/tasks";
import {
  buildTaskDueDate,
  buildTaskFields,
  buildTaskRecurrence,
  buildTaskStatus,
  buildTaskTitle,
  type TaskWriteResult,
} from "@/features/tasks/operations";
import type { ToolContext } from "../context";
import { refuse } from "../protocol/input";
import type { JsonObject } from "../protocol/json";
import type { AgentTool } from "../protocol/server";
import {
  displayTitle,
  editableNote,
  liveFolder,
  nodePath,
  noteDocument,
  saveDocumentOperations,
} from "../workspace";

const STATUSES = ["todo", "in_progress", "done"] as const satisfies readonly TaskStatus[];
const PRIORITIES = ["urgent", "high", "medium", "low"] as const satisfies readonly TaskPriority[];
const STATUS_FILTERS = ["open", "todo", "in_progress", "done", "all"] as const;
const PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const MAX_TITLE_BYTES = 512;

const TASK_ID = { type: "string", minLength: 1 } as const;
const DUE_DATE = {
  type: ["string", "null"],
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "Due date as YYYY-MM-DD; null clears it.",
} as const;
const TAGS = {
  type: "array",
  items: { type: "string", minLength: 1 },
  description: "Tag names. Tags that do not exist yet are created.",
} as const;
const RECURRENCE = {
  type: ["string", "null"],
  description:
    'How a task inside a note repeats, such as "every day", "every week", "every 2 weeks" or "every month". null stops it.',
} as const;

/**
 * @name taskSummary
 * @description A task as agents read it, with tag and people names and the
 * note its checklist line lives in.
 *
 * @example
 * taskSummary(state, state.tasks.get("task-1")!);
 */
export function taskSummary(state: RendererState, task: WorkspaceTask): JsonObject {
  const note = task.source === null ? undefined : state.sourceNodes.get(task.source.noteId);
  const live = note !== undefined && state.nodes.has(note.id);
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    description: task.description,
    tags: task.tagIds.flatMap((id) => state.tags.get(id)?.name ?? []),
    assignees: task.assigneeIds.flatMap((id) => state.people.get(id)?.name ?? []),
    note: live ? { id: note.id, title: displayTitle(note), path: nodePath(state, note.id) } : null,
  };
}

export const taskTools: readonly AgentTool<ToolContext>[] = [
  {
    name: "list_tasks",
    title: "List tasks",
    description:
      "Lists tasks from the Tasks view, soonest due first. Filter by status, by the note or folder their checklist line lives in, by tag, or by due date.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: STATUS_FILTERS,
          description: "open (to do and in progress) is the default.",
        },
        noteId: { type: "string", minLength: 1 },
        folderId: {
          type: "string",
          minLength: 1,
          description: "Tasks in notes anywhere inside this folder.",
        },
        tag: { type: "string", minLength: 1 },
        dueBefore: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Due on or before this date.",
        },
        limit: { type: "integer", minimum: 1, maximum: 500, description: "Defaults to 100." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const state = context.store.getState();
      const status = input.optionalChoice("status", STATUS_FILTERS) ?? "open";
      const noteId = input.optionalText("noteId");
      const folderId = liveFolder(state, input.optionalText("folderId") ?? null);
      const tag = input.optionalText("tag");
      const tagId =
        tag === undefined
          ? undefined
          : ([...state.tags.values()].find(
              (entry) => normalizeEntityName(entry.name) === normalizeEntityName(tag),
            )?.id ?? refuse(`No tag is called "${tag}".`));
      const dueBefore = input.optionalString("dueBefore");
      if (dueBefore !== undefined && !isDueDate(dueBefore)) refuse("dueBefore must be YYYY-MM-DD.");
      const limit = input.optionalInteger("limit", 1, 500) ?? 100;
      const matches = [...state.tasks.values()].filter((task) => {
        if (status === "open" ? task.status === "done" : status !== "all" && task.status !== status)
          return false;
        if (noteId !== undefined && task.source?.noteId !== noteId) return false;
        if (
          folderId !== null &&
          (task.source === null || !insideFolder(state, task.source.noteId, folderId))
        ) {
          return false;
        }
        if (tagId !== undefined && !task.tagIds.includes(tagId)) return false;
        if (dueBefore !== undefined && (task.dueDate === null || task.dueDate > dueBefore))
          return false;
        return !sourceIsLocked(state, task);
      });
      matches.sort(
        (left, right) =>
          compareDue(left.dueDate, right.dueDate) ||
          PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
          right.updatedAt - left.updatedAt,
      );
      return {
        total: matches.length,
        tasks: matches.slice(0, limit).map((task) => taskSummary(state, task)),
      };
    },
  },
  {
    name: "create_task",
    title: "Create a task",
    description:
      "Creates a task in the Tasks view. With noteId the task is added as a tracked checklist line at the end of that note, the way /task does in the editor; without it the task stands on its own.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        noteId: { type: "string", minLength: 1 },
        status: { type: "string", enum: STATUSES },
        priority: { type: "string", enum: PRIORITIES },
        dueDate: DUE_DATE,
        description: { type: "string", description: "Notes on the task, up to 4,000 bytes." },
        tags: TAGS,
        recurrence: { ...RECURRENCE, description: `${RECURRENCE.description} Needs noteId.` },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(input, context) {
      const title = taskTitle(input.text("title"));
      const status = input.optionalChoice("status", STATUSES) ?? "todo";
      const dueDate = input.nullableString("dueDate") ?? null;
      if (dueDate !== null && !isDueDate(dueDate)) refuse("dueDate must be YYYY-MM-DD.");
      const recurrence = input.nullableString("recurrence") ?? null;
      if (recurrence !== null && !isRecurrence(recurrence)) {
        refuse(`"${recurrence}" is not a repeat rule Skriuw understands, such as "every week".`);
      }
      const noteId = input.optionalText("noteId");
      if (recurrence !== null && noteId === undefined) refuse("A repeating task needs noteId.");
      const tagIds = ensureTags(context, input.optionalStringList("tags") ?? []);
      const fields = {
        priority: input.optionalChoice("priority", PRIORITIES) ?? "medium",
        description: input.optionalString("description") ?? "",
        tagIds,
      };
      const at = context.now();
      if (noteId === undefined) {
        const task: WorkspaceTask = {
          id: context.createId(),
          title,
          status,
          dueDate,
          ...fields,
          assigneeIds: [],
          source: null,
          detachedAt: null,
          createdAt: at,
          updatedAt: at,
        };
        await context.commit([{ type: "create_task", task }]);
        return taskSummary(context.store.getState(), task);
      }
      await context.flush();
      const state = context.store.getState();
      editableNote(state, noteId);
      const attrs = { ...taskCheckItemAttrs(status === "done"), dueDate, recurrence };
      const document = appendCheckItem(noteDocument(state, noteId), attrs, title);
      const operations = saveDocumentOperations(state, noteId, document, at).map((operation) =>
        withTaskFields(operation, attrs.taskId, { status, ...fields }),
      );
      if (
        !operations.some((operation) => "task" in operation && operation.task.id === attrs.taskId)
      ) {
        refuse("The task line was written but could not be linked. Try again.");
      }
      await context.commit(operations);
      const created = context.store.getState().tasks.get(attrs.taskId);
      return created === undefined
        ? { id: attrs.taskId }
        : taskSummary(context.store.getState(), created);
    },
  },
  {
    name: "update_task",
    title: "Update a task",
    description:
      "Changes a task's title, status, priority, due date, description, tags or repeat rule. Only the fields given change. A task inside a note keeps its checklist line in step.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: TASK_ID,
        title: { type: "string", minLength: 1 },
        status: { type: "string", enum: STATUSES },
        priority: { type: "string", enum: PRIORITIES },
        dueDate: DUE_DATE,
        description: { type: "string" },
        tags: { ...TAGS, description: `${TAGS.description} Replaces the task's tags.` },
        recurrence: RECURRENCE,
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run(input, context) {
      const taskId = input.text("taskId");
      const initial = context.store.getState();
      const task = initial.tasks.get(taskId) ?? refuse(`No task has id ${taskId}.`);
      if (sourceIsLocked(initial, task)) refuse("This task lives in a locked note.");
      await context.flush();
      const title = input.optionalText("title");
      const status = input.optionalChoice("status", STATUSES);
      const dueDate = input.nullableString("dueDate");
      const recurrence = input.nullableString("recurrence");
      const tags = input.optionalStringList("tags");
      const patch = {
        ...(input.has("priority") ? { priority: input.choice("priority", PRIORITIES) } : {}),
        ...(input.has("description") ? { description: input.string("description") } : {}),
        ...(tags === undefined ? {} : { tagIds: ensureTags(context, tags) }),
      };
      const steps: ((state: RendererState, at: number) => TaskWriteResult)[] = [];
      if (title !== undefined)
        steps.push((state, at) => buildTaskTitle(state, taskId, taskTitle(title), at));
      if (dueDate !== undefined) {
        if (dueDate !== null && !isDueDate(dueDate)) refuse("dueDate must be YYYY-MM-DD.");
        steps.push((state, at) => buildTaskDueDate(state, taskId, dueDate, at));
      }
      if (recurrence !== undefined) {
        if (task.source === null) refuse("Only a task inside a note can repeat.");
        if (recurrence !== null && !isRecurrence(recurrence)) {
          refuse(`"${recurrence}" is not a repeat rule Skriuw understands, such as "every week".`);
        }
        steps.push((state, at) => buildTaskRecurrence(state, taskId, recurrence, at));
      }
      if (Object.keys(patch).length > 0)
        steps.push((state, at) => buildTaskFields(state, taskId, patch, at));
      if (status !== undefined)
        steps.push((state, at) => buildTaskStatus(state, taskId, status, at));
      if (steps.length === 0) refuse("Give at least one field to change.");
      for (const step of steps) {
        const result = step(context.store.getState(), context.now());
        if (result.status === "refused") refuse(result.message);
        await context.commit(result.operations);
      }
      const updated = context.store.getState().tasks.get(taskId);
      return updated === undefined
        ? { id: taskId }
        : taskSummary(context.store.getState(), updated);
    },
  },
  {
    name: "delete_task",
    title: "Delete a task",
    description:
      "Deletes a task that stands on its own. A task inside a note follows its checklist line: removing the line with write_note detaches the task, and a detached task can then be deleted. Marking it done is often what you want instead.",
    inputSchema: {
      type: "object",
      properties: { taskId: TASK_ID },
      required: ["taskId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run(input, context) {
      const state = context.store.getState();
      const taskId = input.text("taskId");
      const task = state.tasks.get(taskId) ?? refuse(`No task has id ${taskId}.`);
      if (task.source !== null) {
        const note = state.sourceNodes.get(task.source.noteId);
        refuse(
          `This task is a checklist line in ${note ? `"${displayTitle(note)}" (${note.id})` : "a note"}. Set its status to done, or remove the line with write_note to detach it and then delete it.`,
        );
      }
      await context.commit([
        { type: "delete_task", id: taskId, document: null, at: context.now() },
      ]);
      return { deleted: taskId };
    },
  },
];

function taskTitle(title: string): string {
  const text = title.replace(/\s+/g, " ").trim();
  if (text.length === 0 || new TextEncoder().encode(text).length > MAX_TITLE_BYTES) {
    refuse("A task title needs between 1 and 512 bytes of text.");
  }
  return text;
}

function ensureTags(context: ToolContext, names: readonly string[]): string[] {
  const state = context.store.getState();
  const existing = new Map(
    [...state.tags.values()].map((tag) => [normalizeEntityName(tag.name), tag.id]),
  );
  const created: ReferenceOperation[] = [];
  const ids: string[] = [];
  const at = context.now();
  for (const name of names) {
    const key = normalizeEntityName(name);
    if (key.length === 0) continue;
    let id = existing.get(key);
    if (id === undefined) {
      id = context.createId();
      existing.set(key, id);
      created.push({
        type: "create_tag",
        tag: { id, name: name.trim(), color: null, createdAt: at, updatedAt: at, createdIn: null },
      });
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > 32) refuse("A task takes up to 32 different tags.");
  if (created.length > 0) context.commitReferences(created);
  return ids;
}

function appendCheckItem(
  document: ProseMirrorNode,
  attrs: Record<string, string | boolean | null>,
  title: string,
): ProseMirrorNode {
  const { check_list: checkList, check_item: checkItem, paragraph } = productSchema.nodes;
  if (checkList === undefined || checkItem === undefined || paragraph === undefined) {
    refuse("This build of Skriuw has no checklists.");
  }
  const item = checkItem.create(attrs, paragraph.create(null, productSchema.text(title)));
  const content = document.content;
  const last = document.lastChild;
  if (last !== null && last.type === checkList) {
    const list = last.copy(last.content.addToEnd(item));
    return document.copy(content.replaceChild(content.childCount - 1, list));
  }
  const trimmed =
    last !== null && last.type === paragraph && last.content.size === 0 && content.childCount > 1
      ? content.cut(0, content.size - last.nodeSize)
      : content;
  return document.copy(trimmed.addToEnd(checkList.create(null, item)));
}

function withTaskFields(
  operation: WorkspaceOperation,
  taskId: string,
  fields: Pick<WorkspaceTask, "status" | "priority" | "description" | "tagIds">,
): WorkspaceOperation {
  if (operation.type === "promote_checklist_task" || operation.type === "create_task") {
    if (operation.task.id === taskId)
      return { ...operation, task: { ...operation.task, ...fields } };
  }
  return operation;
}

function insideFolder(state: RendererState, noteId: string, folderId: string): boolean {
  let current = state.sourceNodes.get(noteId)?.parentId ?? null;
  for (let hops = 0; current !== null && hops < 256; hops += 1) {
    if (current === folderId) return true;
    current = state.sourceNodes.get(current)?.parentId ?? null;
  }
  return false;
}

function sourceIsLocked(state: RendererState, task: WorkspaceTask): boolean {
  return task.source !== null && state.sourceNodes.get(task.source.noteId)?.lockedAt != null;
}

function compareDue(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}
