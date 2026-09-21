import type {
  TaskStatus,
  WorkspaceOperation,
  WorkspaceTask,
} from "@skriuw/renderer-core/contracts/workspace";
import type { DocumentRecord, RendererState } from "@skriuw/renderer-core/store/types";
import {
  alignChecklist,
  findByBlockId,
  isTaskIdentifier,
  linkItem,
  tickItem,
  unlinkItem,
  type ChecklistAlignment,
  type DocumentEdit,
} from "./checklist-document";

export type TaskWriteRefusal =
  | "unknown-task"
  | "note-not-loaded"
  | "block-missing"
  | "block-ambiguous"
  | "document-mismatch"
  | "already-linked"
  | "empty-title"
  | "invalid-identity"
  | "not-linked";

export type TaskWriteResult =
  | { status: "ready"; operations: WorkspaceOperation[] }
  | { status: "refused"; reason: TaskWriteRefusal; message: string };

export type PromotionInput = {
  noteId: string;
  /** Position among the note's checklist items, as `projectPromotable` reports it. */
  itemIndex: number;
  taskId: string;
  blockId: string;
  at: number;
};

const MESSAGES: Record<TaskWriteRefusal, string> = {
  "unknown-task": "That task no longer exists.",
  "note-not-loaded": "The source note is not loaded, so it cannot be updated.",
  "block-missing": "The source note no longer contains this checklist item.",
  "block-ambiguous":
    "The source note links this task from more than one checklist item. Delete the duplicate to change it here.",
  "document-mismatch":
    "The source note could not be read here. Open it in the editor to change it.",
  "already-linked": "That checklist item is already a task.",
  "empty-title": "Give the checklist item some text before promoting it.",
  "invalid-identity": "That task could not be given an identity.",
  "not-linked": "That task has no checklist item to change.",
};

function refuse(reason: TaskWriteRefusal): TaskWriteResult {
  return { status: "refused", reason, message: MESSAGES[reason] };
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
 * Neither edit this surface makes changes a word of the document: a tick is an
 * attribute and the task marker is an HTML comment the serializer writes
 * outside the text. The stored count therefore travels unchanged rather than
 * being recomputed by a second, disagreeing counter.
 */
function sourceDocument(record: DocumentRecord, edit: DocumentEdit) {
  return {
    noteId: record.noteId,
    documentJson: edit.documentJson,
    markdown: edit.markdown,
    wordCount: record.wordCount,
    expectedRevision: record.revision,
  };
}

type LoadedNote = { record: DocumentRecord; alignment: ChecklistAlignment };

function loadNote(state: RendererState, noteId: string): LoadedNote | TaskWriteResult {
  const record = state.documents.get(noteId);
  if (!record) {
    return refuse("note-not-loaded");
  }
  const alignment = alignChecklist(record.documentJson, record.markdown);
  if (alignment === null) {
    return refuse("document-mismatch");
  }
  return { record, alignment };
}

function isRefusal(value: LoadedNote | TaskWriteResult): value is TaskWriteResult {
  return "status" in value;
}

/**
 * Builds the paired write that toggles a task's completion: the record and the
 * rewritten source document in one operation, so the next save of that note
 * reconciles to the new checkbox instead of reverting it (ADR-0031). Refuses
 * rather than guessing whenever the document and the record disagree.
 */
export function buildTaskToggle(state: RendererState, taskId: string, at: number): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task");
  }
  const status = flipped(task.status);
  const updated: WorkspaceTask = { ...task, status, updatedAt: at };
  if (task.source === null) {
    return {
      status: "ready",
      operations: [{ type: "update_task", task: updated, document: null }],
    };
  }
  const loaded = loadNote(state, task.source.noteId);
  if (isRefusal(loaded)) {
    return loaded;
  }
  const lookup = findByBlockId(loaded.alignment, task.source.blockId);
  if (lookup.status !== "found") {
    return refuse(lookup.status === "missing" ? "block-missing" : "block-ambiguous");
  }
  const edit = tickItem(loaded.alignment, lookup.item.index, status === "done");
  if (edit === null) {
    return refuse("document-mismatch");
  }
  return {
    status: "ready",
    operations: [
      { type: "update_task", task: updated, document: sourceDocument(loaded.record, edit) },
    ],
  };
}

/**
 * Builds the promotion of one checklist item: the document that now carries
 * the link and the task record it points at, in the single operation ADR-0031
 * requires, so no half of the pair can land alone. Nothing here promotes by
 * shape — the caller names the item a person chose.
 */
export function buildChecklistPromotion(
  state: RendererState,
  input: PromotionInput,
): TaskWriteResult {
  if (
    !isTaskIdentifier(input.taskId) ||
    !isTaskIdentifier(input.blockId) ||
    input.taskId === input.blockId
  ) {
    return refuse("invalid-identity");
  }
  const loaded = loadNote(state, input.noteId);
  if (isRefusal(loaded)) {
    return loaded;
  }
  const item = loaded.alignment.items[input.itemIndex];
  if (item === undefined) {
    return refuse("block-missing");
  }
  if (item.taskId !== null) {
    return refuse("already-linked");
  }
  if (item.title.length === 0) {
    return refuse("empty-title");
  }
  const edit = linkItem(loaded.alignment, item.index, input.taskId, input.blockId);
  if (edit === null) {
    return refuse("document-mismatch");
  }
  return {
    status: "ready",
    operations: [
      {
        type: "promote_checklist_task",
        task: {
          id: input.taskId,
          title: item.title,
          status: item.checked ? "done" : "todo",
          priority: "medium",
          dueDate: null,
          description: "",
          tagIds: [],
          assigneeIds: [],
          source: { noteId: input.noteId, blockId: input.blockId },
          detachedAt: null,
          createdAt: input.at,
          updatedAt: input.at,
        },
        document: sourceDocument(loaded.record, edit),
      },
    ],
  };
}

/**
 * Takes a promotion back: the record goes and the checklist item returns to a
 * plain checkbox. Deletion rather than detachment is what undo means here —
 * a detached task would leave behind exactly the workspace clutter ADR-0031
 * exists to prevent.
 */
export function buildPromotionUndo(
  state: RendererState,
  taskId: string,
  at: number,
): TaskWriteResult {
  const task = state.tasks.get(taskId);
  if (!task) {
    return refuse("unknown-task");
  }
  if (task.source === null) {
    return refuse("not-linked");
  }
  const loaded = loadNote(state, task.source.noteId);
  if (isRefusal(loaded)) {
    return loaded;
  }
  const lookup = findByBlockId(loaded.alignment, task.source.blockId);
  if (lookup.status !== "found") {
    return refuse(lookup.status === "missing" ? "block-missing" : "block-ambiguous");
  }
  const edit = unlinkItem(loaded.alignment, lookup.item.index);
  if (edit === null) {
    return refuse("document-mismatch");
  }
  return {
    status: "ready",
    operations: [
      { type: "delete_task", id: task.id, document: sourceDocument(loaded.record, edit), at },
    ],
  };
}
