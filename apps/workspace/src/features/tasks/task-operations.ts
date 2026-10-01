import type {
  TaskStatus,
  WorkspaceOperation,
  WorkspaceTask,
} from "@skriuw/renderer-core/contracts/workspace";
import { countWords, productSchema, serializeProductMarkdown } from "@/features/editor/schema";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { isDueDate } from "./due-dates";

export type TaskWriteRefusal =
  | "unknown-task"
  | "note-not-loaded"
  | "block-missing"
  | "block-ambiguous"
  | "document-unreadable"
  | "invalid-date";

export type TaskWriteResult =
  | { status: "ready"; operations: WorkspaceOperation[] }
  | { status: "refused"; reason: TaskWriteRefusal; message: string };

type JsonNode = {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
};

function isJsonNode(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null;
}

function matchesBlock(node: JsonNode, blockId: string): boolean {
  return node.type === "check_item" && node.attrs?.blockId === blockId;
}

type CheckItemPatch = { checked: boolean } | { dueDate: string | null };

function rewriteNode(
  value: unknown,
  blockId: string,
  patch: CheckItemPatch,
): { node: unknown; matches: number } {
  if (!isJsonNode(value)) {
    return { node: value, matches: 0 };
  }
  let matches = 0;
  let attrs = value.attrs;
  if (matchesBlock(value, blockId)) {
    matches += 1;
    attrs = { ...attrs, ...patch };
  }
  let content = value.content;
  if (Array.isArray(value.content)) {
    const rewritten = value.content.map((child) => rewriteNode(child, blockId, patch));
    matches += rewritten.reduce((total, entry) => total + entry.matches, 0);
    if (rewritten.some((entry) => entry.matches > 0)) {
      content = rewritten.map((entry) => entry.node);
    }
  }
  if (matches === 0) {
    return { node: value, matches: 0 };
  }
  return { node: { ...value, attrs, content }, matches };
}

function refuse(reason: TaskWriteRefusal, message: string): TaskWriteResult {
  return { status: "refused", reason, message };
}

/**
 * `reconciled_status` on the backend keeps an `in_progress` task in progress
 * when a checkbox cannot express it. This surface never sets `in_progress`, so
 * a plain two-state flip is correct here and the reconciliation rule stays in
 * one place.
 */
function flipped(status: TaskStatus): TaskStatus {
  return status === "done" ? "todo" : "done";
}

/**
 * Builds the paired write for a task record change: the record and, for a
 * linked task, the source document rewritten with the same change in one
 * operation, so the next save of that note reconciles to it instead of
 * reverting it. Refuses rather than guessing whenever the document and the
 * record disagree.
 */
function pairedTaskWrite(
  state: RendererState,
  task: WorkspaceTask,
  patch: CheckItemPatch,
): TaskWriteResult {
  if (task.source === null) {
    return { status: "ready", operations: [{ type: "update_task", task, document: null }] };
  }
  const record = state.documents.get(task.source.noteId);
  if (!record) {
    return refuse("note-not-loaded", "The source note is not loaded, so it cannot be updated.");
  }
  const { node, matches } = rewriteNode(record.documentJson, task.source.blockId, patch);
  if (matches === 0) {
    return refuse("block-missing", "The source note no longer contains this checklist item.");
  }
  if (matches > 1) {
    return refuse(
      "block-ambiguous",
      "The source note links this task from more than one checklist item. Delete the duplicate to change it here.",
    );
  }
  let document;
  try {
    document = productSchema.nodeFromJSON(node);
  } catch (error) {
    console.error("task write could not read the source document", error);
    return refuse("document-unreadable", "The source note could not be read.");
  }
  return {
    status: "ready",
    operations: [
      {
        type: "update_task",
        task,
        document: {
          noteId: task.source.noteId,
          documentJson: node,
          markdown: serializeProductMarkdown(document),
          wordCount: countWords(document),
          expectedRevision: record.revision,
        },
      },
    ],
  };
}

/**
 * Toggles a task's completion as a paired write of the record and the source
 * checklist item's checkbox.
 */
export function buildTaskToggle(state: RendererState, taskId: string, at: number): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  const status = flipped(task.status);
  return pairedTaskWrite(state, { ...task, status, updatedAt: at }, { checked: status === "done" });
}

/**
 * Sets or clears a task's due date as a paired write of the record and the
 * source checklist item's `dueDate`, which is what the Markdown `📅` token is
 * serialized from.
 */
export function buildTaskDueDate(
  state: RendererState,
  taskId: string,
  dueDate: string | null,
  at: number,
): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  if (dueDate !== null && !isDueDate(dueDate)) {
    return refuse("invalid-date", "That is not a calendar date.");
  }
  return pairedTaskWrite(state, { ...task, dueDate, updatedAt: at }, { dueDate });
}
