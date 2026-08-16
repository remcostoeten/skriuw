import type { WorkspaceTask } from "@/contracts/workspace";
import type { RendererState } from "@/store/types";

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
 * group for work that has none — quick-added, detached, or orphaned by a purged
 * note. Built from `state.tasks` alone: scanning documents would both cost more
 * than the performance contract allows and disagree with the backend about what
 * counts as detached.
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
