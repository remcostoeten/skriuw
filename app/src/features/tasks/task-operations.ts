import type { TaskStatus, WorkspaceOperation, WorkspaceTask } from "@/contracts/workspace";
import { countWords, productSchema, serializeProductMarkdown } from "@/features/editor/schema";
import type { RendererState } from "@/store/types";

export type TaskToggleRefusal =
  | "unknown-task"
  | "note-not-loaded"
  | "block-missing"
  | "block-ambiguous"
  | "document-unreadable";

export type TaskToggleResult =
  | { status: "ready"; operations: WorkspaceOperation[] }
  | { status: "refused"; reason: TaskToggleRefusal; message: string };

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

function rewriteNode(
  value: unknown,
  blockId: string,
  checked: boolean,
): { node: unknown; matches: number } {
  if (!isJsonNode(value)) {
    return { node: value, matches: 0 };
  }
  let matches = 0;
  let attrs = value.attrs;
  if (matchesBlock(value, blockId)) {
    matches += 1;
    attrs = { ...attrs, checked };
  }
  let content = value.content;
  if (Array.isArray(value.content)) {
    const rewritten = value.content.map((child) => rewriteNode(child, blockId, checked));
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

function refuse(reason: TaskToggleRefusal, message: string): TaskToggleResult {
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

function withStatus(task: WorkspaceTask, status: TaskStatus, at: number): WorkspaceTask {
  return { ...task, status, updatedAt: at };
}

/**
 * Builds the paired write that toggles a task's completion: the record and the
 * rewritten source document in one operation, so the next save of that note
 * reconciles to the new checkbox instead of reverting it. Refuses rather than
 * guessing whenever the document and the record disagree.
 */
export function buildTaskToggle(
  state: RendererState,
  taskId: string,
  at: number,
): TaskToggleResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task", "That task no longer exists.");
  }
  const status = flipped(task.status);
  if (task.source === null) {
    return {
      status: "ready",
      operations: [{ type: "update_task", task: withStatus(task, status, at), document: null }],
    };
  }
  const record = state.documents.get(task.source.noteId);
  if (!record) {
    return refuse("note-not-loaded", "The source note is not loaded, so it cannot be updated.");
  }
  const { node, matches } = rewriteNode(
    record.documentJson,
    task.source.blockId,
    status === "done",
  );
  if (matches === 0) {
    return refuse("block-missing", "The source note no longer contains this checklist item.");
  }
  if (matches > 1) {
    return refuse(
      "block-ambiguous",
      "The source note links this task from more than one checklist item. Delete the duplicate to toggle it here.",
    );
  }
  let document;
  try {
    document = productSchema.nodeFromJSON(node);
  } catch (error) {
    console.error("task toggle could not read the source document", error);
    return refuse("document-unreadable", "The source note could not be read.");
  }
  return {
    status: "ready",
    operations: [
      {
        type: "update_task",
        task: withStatus(task, status, at),
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
