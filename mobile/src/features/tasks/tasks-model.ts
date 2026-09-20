import type { WorkspaceTask } from "../../../../shared/renderer-core/src/contracts/workspace";
import type { RendererState } from "../../../../shared/renderer-core/src/store/types";
import { checklistItems } from "./checklist-document";

export const UNSOURCED_GROUP_LABEL = "No source";

export type TaskRow = {
  id: string;
  title: string;
  done: boolean;
  /** Set only when the source note still resolves, so a row never offers a dead jump. */
  noteId: string | null;
  noteTitle: string | null;
  blockId: string | null;
  detached: boolean;
  createdAt: number;
};

export type TaskGroup = {
  noteId: string | null;
  noteTitle: string;
  rows: readonly TaskRow[];
};

export type TaskSummary = {
  total: number;
  open: number;
};

export type PromotionCandidate = {
  /** Position among the note's checklist items; `buildChecklistPromotion` names the item by it. */
  itemIndex: number;
  title: string;
  checked: boolean;
};

export type PromotionSource = {
  noteId: string;
  noteTitle: string;
  candidates: readonly PromotionCandidate[];
};

function untitled(title: string): string {
  return title.trim().length > 0 ? title : "Untitled";
}

function taskToRow(state: RendererState, task: WorkspaceTask): TaskRow {
  const node = task.source ? state.nodes.get(task.source.noteId) : undefined;
  const resolved = node !== undefined && task.source !== null;
  return {
    id: task.id,
    title: task.title,
    done: task.status === "done",
    noteId: resolved ? task.source!.noteId : null,
    noteTitle: resolved ? untitled(node!.title) : null,
    blockId: resolved ? task.source!.blockId : null,
    detached: task.source === null,
    createdAt: task.createdAt,
  };
}

function byCreation(left: TaskRow, right: TaskRow): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

/**
 * Groups every task in the workspace under its source note, with a trailing
 * group for work that has none — detached, or orphaned by a purged note. Built
 * from `state.tasks` alone, exactly as the desktop surface builds it
 * (`app/src/features/tasks/tasks-model.ts`): scanning documents would both
 * cost more than the performance contract allows and disagree with the backend
 * about what counts as detached.
 */
export function projectTasks(state: RendererState): TaskGroup[] {
  const byNote = new Map<string, TaskRow[]>();
  const unsourced: TaskRow[] = [];
  for (const task of state.tasks.values()) {
    const row = taskToRow(state, task);
    if (row.noteId === null) {
      unsourced.push(row);
      continue;
    }
    const rows = byNote.get(row.noteId) ?? [];
    rows.push(row);
    byNote.set(row.noteId, rows);
  }
  const groups: TaskGroup[] = [...byNote.entries()]
    .map(([noteId, rows]) => ({
      noteId,
      noteTitle: rows[0]!.noteTitle!,
      rows: rows.sort(byCreation),
    }))
    .sort(
      (left, right) =>
        left.noteTitle.localeCompare(right.noteTitle) || left.noteId!.localeCompare(right.noteId!),
    );
  if (unsourced.length > 0) {
    groups.push({
      noteId: null,
      noteTitle: UNSOURCED_GROUP_LABEL,
      rows: unsourced.sort(byCreation),
    });
  }
  return groups;
}

export function summarizeTasks(state: RendererState): TaskSummary {
  let open = 0;
  for (const task of state.tasks.values()) {
    if (task.status !== "done") {
      open += 1;
    }
  }
  return { total: state.tasks.size, open };
}

export function taskSummariesEqual(left: TaskSummary, right: TaskSummary): boolean {
  return left.total === right.total && left.open === right.open;
}

/**
 * The checklist items the open note offers for promotion.
 *
 * Only the open note is read. Promotion needs the document, and the workspace
 * holds every document in memory, so offering the whole workspace would put a
 * full-document scan on a store subscription — the cost the desktop surface
 * refuses for the same reason. One note is also what explicit intent means
 * here: the item a person is looking at, not one the surface found for them.
 */
export function projectPromotionSource(state: RendererState): PromotionSource | null {
  const noteId = state.activeNoteId;
  if (noteId === null) {
    return null;
  }
  const record = state.documents.get(noteId);
  if (!record) {
    return null;
  }
  const candidates = checklistItems(record.documentJson)
    .filter((item) => item.taskId === null && item.title.length > 0)
    .map((item) => ({ itemIndex: item.index, title: item.title, checked: item.checked }));
  if (candidates.length === 0) {
    return null;
  }
  return { noteId, noteTitle: untitled(state.nodes.get(noteId)?.title ?? ""), candidates };
}

export function promotionSourcesEqual(
  left: PromotionSource | null,
  right: PromotionSource | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.noteId === right.noteId &&
    left.noteTitle === right.noteTitle &&
    left.candidates.length === right.candidates.length &&
    left.candidates.every((candidate, index) => {
      const other = right.candidates[index];
      return (
        other !== undefined &&
        candidate.itemIndex === other.itemIndex &&
        candidate.title === other.title &&
        candidate.checked === other.checked
      );
    })
  );
}

function rowsEqual(left: readonly TaskRow[], right: readonly TaskRow[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((row, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      row.id === other.id &&
      row.title === other.title &&
      row.done === other.done &&
      row.noteId === other.noteId &&
      row.noteTitle === other.noteTitle &&
      row.blockId === other.blockId &&
      row.detached === other.detached &&
      row.createdAt === other.createdAt
    );
  });
}

export function taskGroupsEqual(left: readonly TaskGroup[], right: readonly TaskGroup[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((group, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      group.noteId === other.noteId &&
      group.noteTitle === other.noteTitle &&
      rowsEqual(group.rows, other.rows)
    );
  });
}

export function flattenTaskRows(groups: readonly TaskGroup[]): TaskRow[] {
  return groups.flatMap((group) => [...group.rows]);
}
