import type { WorkspaceTask } from "@skriuw/renderer-core/contracts/workspace";
import type { DateKey } from "@skriuw/renderer-core/journal/dates";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { dueBucket, isDueDate, type DueBucket } from "./due-dates";

export type TaskRow = {
  id: string;
  title: string;
  done: boolean;
  dueDate: DateKey | null;
  /** Set only when the source note still resolves, so a row never offers a dead jump. */
  noteId: string | null;
  noteTitle: string | null;
  blockId: string | null;
  detached: boolean;
  createdAt: number;
};

export type TaskGroup = {
  bucket: DueBucket;
  label: string;
  rows: readonly TaskRow[];
};

const GROUP_ORDER: readonly DueBucket[] = ["overdue", "today", "upcoming", "none", "earlier"];

export const TASK_GROUP_LABELS: Readonly<Record<DueBucket, string>> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  none: "No date",
  earlier: "Completed earlier",
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
    dueDate: isDueDate(task.dueDate) ? task.dueDate : null,
    noteId: resolved ? task.source!.noteId : null,
    noteTitle: resolved ? untitled(node!.title) : null,
    blockId: resolved ? task.source!.blockId : null,
    detached: task.source === null,
    createdAt: task.createdAt,
  };
}

function byDueDate(left: TaskRow, right: TaskRow): number {
  if (left.dueDate === right.dueDate) return 0;
  if (left.dueDate === null) return 1;
  if (right.dueDate === null) return -1;
  return left.dueDate < right.dueDate ? -1 : 1;
}

function bySource(left: TaskRow, right: TaskRow): number {
  if (left.noteTitle === right.noteTitle) return 0;
  if (left.noteTitle === null) return 1;
  if (right.noteTitle === null) return -1;
  return left.noteTitle.localeCompare(right.noteTitle);
}

function rowOrder(left: TaskRow, right: TaskRow): number {
  return (
    byDueDate(left, right) ||
    bySource(left, right) ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Groups every task in the workspace by its due date relative to `today`:
 * Overdue, Today, Upcoming, No date, and completed work whose date has passed.
 * Within a group, rows run by date, then source note, then creation. Built from
 * `state.tasks` alone: scanning documents would both cost more than the
 * performance contract allows and disagree with the backend about what counts
 * as detached.
 */
export function projectTasks(state: RendererState, today: DateKey): TaskGroup[] {
  const buckets = new Map<DueBucket, TaskRow[]>();
  for (const task of state.tasks.values()) {
    const row = taskToRow(state, task);
    const bucket = dueBucket(row.dueDate, row.done, today);
    const rows = buckets.get(bucket) ?? [];
    rows.push(row);
    buckets.set(bucket, rows);
  }
  return GROUP_ORDER.flatMap((bucket) => {
    const rows = buckets.get(bucket);
    return rows ? [{ bucket, label: TASK_GROUP_LABELS[bucket], rows: rows.sort(rowOrder) }] : [];
  });
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
      row.dueDate === other.dueDate &&
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
      other !== undefined && group.bucket === other.bucket && rowsEqual(group.rows, other.rows)
    );
  });
}

export function flattenTaskRows(groups: readonly TaskGroup[]): TaskRow[] {
  return groups.flatMap((group) => [...group.rows]);
}
