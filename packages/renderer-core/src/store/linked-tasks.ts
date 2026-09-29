import type { TaskStatus, WorkspaceTask } from "../contracts/workspace";
import { isDateKey } from "../journal/dates";

type DocumentLink = {
  blockId: string;
  title: string;
  checked: boolean;
  dueDate: string | null;
};

type JsonNode = {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
};

const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

function isJsonNode(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null;
}

function textContent(value: unknown): string {
  if (!isJsonNode(value)) return "";
  let text = typeof value.text === "string" ? value.text : "";
  if (Array.isArray(value.content)) {
    for (const child of value.content) text += textContent(child);
  }
  return text;
}

function linkTitle(node: JsonNode): string {
  const first = Array.isArray(node.content) ? node.content[0] : undefined;
  return isJsonNode(first) && first.type === "paragraph" ? textContent(first).trim() : "";
}

function collectLinks(value: unknown, links: Map<string, DocumentLink | null>): void {
  if (!isJsonNode(value)) return;
  const attrs = value.attrs;
  const taskId = attrs?.taskId;
  const blockId = attrs?.blockId;
  if (
    value.type === "check_item" &&
    typeof taskId === "string" &&
    typeof blockId === "string" &&
    IDENTIFIER.test(taskId) &&
    IDENTIFIER.test(blockId) &&
    taskId !== blockId
  ) {
    const title = linkTitle(value);
    if (title.length > 0) {
      const dueDate = attrs?.dueDate;
      links.set(
        taskId,
        links.has(taskId)
          ? null
          : {
              blockId,
              title,
              checked: attrs?.checked === true,
              dueDate: typeof dueDate === "string" && isDateKey(dueDate) ? dueDate : null,
            },
      );
    }
  }
  if (Array.isArray(value.content)) {
    for (const child of value.content) collectLinks(child, links);
  }
}

function reconciledStatus(status: TaskStatus, checked: boolean): TaskStatus {
  if (checked) return "done";
  return status === "done" ? "todo" : status;
}

/**
 * @name reconcileLinkedTasks
 * @description Mirrors the backend's save-time reconciliation so the renderer's
 * task records follow the document that was just saved: the checklist item's
 * title, checkbox, and due date win, and a link the document no longer carries
 * exactly once detaches its task. Returns `tasks` itself when nothing changed.
 *
 * @example
 * const next = reconcileLinkedTasks(state.tasks, "note-1", documentJson, Date.now());
 */
export function reconcileLinkedTasks(
  tasks: ReadonlyMap<string, WorkspaceTask>,
  noteId: string,
  documentJson: unknown,
  at: number,
): ReadonlyMap<string, WorkspaceTask> {
  let links: Map<string, DocumentLink | null> | null = null;
  let next: Map<string, WorkspaceTask> | null = null;
  for (const task of tasks.values()) {
    if (task.source?.noteId !== noteId) continue;
    if (links === null) {
      links = new Map();
      collectLinks(documentJson, links);
    }
    const link = links.get(task.id);
    let updated: WorkspaceTask | null = null;
    if (!link) {
      updated = { ...task, source: null, detachedAt: at, updatedAt: at };
    } else {
      const status = reconciledStatus(task.status, link.checked);
      if (
        status !== task.status ||
        link.title !== task.title ||
        link.dueDate !== task.dueDate ||
        link.blockId !== task.source.blockId
      ) {
        updated = {
          ...task,
          title: link.title,
          status,
          dueDate: link.dueDate,
          source: { noteId, blockId: link.blockId },
          updatedAt: at,
        };
      }
    }
    if (updated !== null) {
      next ??= new Map(tasks);
      next.set(task.id, updated);
    }
  }
  return next ?? tasks;
}
