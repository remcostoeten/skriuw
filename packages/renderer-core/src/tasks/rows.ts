import type {
  TaskPriority,
  TaskStatus,
  WorkspaceTask,
} from "@skriuw/renderer-core/contracts/workspace";
import { dateKeyOf, shiftDay, type DateKey } from "@skriuw/renderer-core/journal/dates";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { daysLate, formatDueLabel, isDueDate } from "@skriuw/renderer-core/tasks/due-dates";
import { formatRecurrenceLabel } from "@skriuw/renderer-core/tasks/recurrence";
import { checkItemFacts } from "./task-document";

export type TaskLink = "linked" | "detached" | "orphaned" | "none";

export type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  done: boolean;
  priority: TaskPriority;
  dueDate: DateKey | null;
  description: string;
  tags: readonly string[];
  link: TaskLink;
  /** Set only when the source note still resolves, so a row never offers a dead jump. */
  noteId: string | null;
  noteTitle: string | null;
  folderTitle: string | null;
  blockId: string | null;
  recurrence: string | null;
  subtasksDone: number;
  subtasksTotal: number;
  createdAt: number;
  updatedAt: number;
};

export type TaskGrouping = "due" | "note";

export type TaskGroupKind =
  | "overdue"
  | "today"
  | "upcoming"
  | "none"
  | "note"
  | "detached"
  | "completed";

export type TaskGroup = {
  id: string;
  kind: TaskGroupKind;
  title: string;
  rows: readonly TaskRow[];
  noteId: string | null;
  folderTitle: string | null;
};

export type TaskOverlay = {
  status?: TaskStatus;
  dueDate?: DateKey | null;
  title?: string;
};

export type TaskSummary = {
  open: number;
  overdue: number;
  doneToday: number;
};

export type WeekDay = {
  dueDate: DateKey;
  count: number;
};

const DUE_GROUPS: readonly Exclude<TaskGroupKind, "note" | "detached" | "completed">[] = [
  "overdue",
  "today",
  "upcoming",
  "none",
];

export const TASK_GROUP_TITLES: Readonly<Record<Exclude<TaskGroupKind, "note">, string>> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  none: "No date",
  detached: "Detached",
  completed: "Completed",
};

export const COMPLETED_PREVIEW = 3;

const NO_SETTLING: ReadonlySet<string> = new Set();

function untitled(title: string): string {
  return title.trim().length > 0 ? title : "Untitled";
}

function taskLink(task: WorkspaceTask, resolved: boolean): TaskLink {
  if (resolved) return "linked";
  if (task.source !== null) return "orphaned";
  return task.detachedAt === null ? "none" : "detached";
}

function taskToRow(state: RendererState, task: WorkspaceTask): TaskRow {
  const source = task.source;
  const node = source ? state.nodes.get(source.noteId) : undefined;
  const linked = source !== null && node !== undefined;
  const parent = node?.parentId ? state.nodes.get(node.parentId) : undefined;
  const document = linked ? state.documents.get(source.noteId) : undefined;
  const facts = linked && document ? checkItemFacts(document.documentJson, source.blockId) : null;
  const tags = task.tagIds.flatMap((tagId) => {
    const tag = state.tags.get(tagId);
    return tag ? [tag.name] : [];
  });
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    done: task.status === "done",
    priority: task.priority,
    dueDate: isDueDate(task.dueDate) ? task.dueDate : null,
    description: task.description,
    tags,
    link: taskLink(task, linked),
    noteId: linked ? source.noteId : null,
    noteTitle: linked ? untitled(node.title) : null,
    folderTitle: parent ? untitled(parent.title) : null,
    blockId: linked ? source.blockId : null,
    recurrence: facts?.recurrence ?? null,
    subtasksDone: facts?.subtasks.done ?? 0,
    subtasksTotal: facts?.subtasks.total ?? 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
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

function mostRecentFirst(left: TaskRow, right: TaskRow): number {
  return right.updatedAt - left.updatedAt || left.id.localeCompare(right.id);
}

/**
 * @name projectTaskRows
 * @description Every task in the workspace as a row the tasks view renders,
 * in a stable order. Built from `state.tasks`, with the source note's title,
 * folder, repeat rule, and subtask counts read from a per-document index that
 * is only rebuilt when that note's stored document changes.
 *
 * @example
 * const rows = projectTaskRows(store.getState());
 */
export function projectTaskRows(state: RendererState): TaskRow[] {
  return [...state.tasks.values()].map((task) => taskToRow(state, task)).sort(rowOrder);
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function sameRow(left: TaskRow, right: TaskRow): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.status === right.status &&
    left.priority === right.priority &&
    left.dueDate === right.dueDate &&
    left.description === right.description &&
    sameTags(left.tags, right.tags) &&
    left.link === right.link &&
    left.noteId === right.noteId &&
    left.noteTitle === right.noteTitle &&
    left.folderTitle === right.folderTitle &&
    left.blockId === right.blockId &&
    left.recurrence === right.recurrence &&
    left.subtasksDone === right.subtasksDone &&
    left.subtasksTotal === right.subtasksTotal &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

/**
 * @name taskRowsEqual
 * @description Equality for the row selector, so the view re-renders only
 * when something a row shows has changed.
 *
 * @example
 * useRendererSelector(store, projectTaskRows, taskRowsEqual);
 */
export function taskRowsEqual(left: readonly TaskRow[], right: readonly TaskRow[]): boolean {
  return (
    left.length === right.length &&
    left.every((row, index) => {
      const other = right[index];
      return other !== undefined && sameRow(row, other);
    })
  );
}

/**
 * @name applyTaskOverlay
 * @description Lays changes the view has shown but not yet written over the
 * stored rows, so a completion or new date draws in the same frame as the key
 * press while the write waits for pending saves.
 *
 * @example
 * applyTaskOverlay(rows, new Map([["task-1", { status: "done" }]]));
 */
export function applyTaskOverlay(
  rows: readonly TaskRow[],
  overlay: ReadonlyMap<string, TaskOverlay>,
): TaskRow[] {
  if (overlay.size === 0) return [...rows];
  return rows.map((row) => {
    const patch = overlay.get(row.id);
    if (!patch) return row;
    const status = patch.status ?? row.status;
    return {
      ...row,
      status,
      done: status === "done",
      dueDate: patch.dueDate === undefined ? row.dueDate : patch.dueDate,
      title: patch.title ?? row.title,
    };
  });
}

/**
 * @name filterTaskRows
 * @description Keeps the rows whose title, note, folder, repeat rule, tags, or
 * notes contain every word of the query, ignoring case.
 *
 * @example
 * filterTaskRows(rows, "review weekly");
 */
export function filterTaskRows(rows: readonly TaskRow[], query: string): readonly TaskRow[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((row) => {
    const haystack = [
      row.title,
      row.noteTitle ?? "",
      row.folderTitle ?? "",
      row.recurrence ? formatRecurrenceLabel(row.recurrence) : "",
      row.tags.join(" "),
      row.description,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

function dueKind(row: TaskRow, today: DateKey): (typeof DUE_GROUPS)[number] {
  if (row.dueDate === null) return "none";
  if (row.dueDate < today) return "overdue";
  return row.dueDate === today ? "today" : "upcoming";
}

function group(kind: Exclude<TaskGroupKind, "note">, rows: readonly TaskRow[]): TaskGroup {
  return {
    id: kind,
    kind,
    title: TASK_GROUP_TITLES[kind],
    rows,
    noteId: null,
    folderTitle: null,
  };
}

function groupByDue(
  rows: readonly TaskRow[],
  today: DateKey,
  settling: ReadonlySet<string>,
): TaskGroup[] {
  const buckets = new Map<TaskGroupKind, TaskRow[]>();
  const completed: TaskRow[] = [];
  for (const row of rows) {
    const shownOpen = !row.done || settling.has(row.id);
    if (!shownOpen && row.dueDate !== today) {
      completed.push(row);
      continue;
    }
    const kind = dueKind(row, today);
    const bucket = buckets.get(kind) ?? [];
    bucket.push(row);
    buckets.set(kind, bucket);
  }
  const groups = DUE_GROUPS.flatMap((kind) => {
    const bucket = buckets.get(kind);
    return bucket ? [group(kind, bucket)] : [];
  });
  return completed.length > 0
    ? [...groups, group("completed", completed.sort(mostRecentFirst))]
    : groups;
}

function earliestDue(rows: readonly TaskRow[]): DateKey | null {
  return rows.reduce<DateKey | null>(
    (earliest, row) =>
      row.dueDate !== null && (earliest === null || row.dueDate < earliest)
        ? row.dueDate
        : earliest,
    null,
  );
}

function noteGroupOrder(left: TaskGroup, right: TaskGroup): number {
  const leftDue = earliestDue(left.rows);
  const rightDue = earliestDue(right.rows);
  if (leftDue !== rightDue) {
    if (leftDue === null) return 1;
    if (rightDue === null) return -1;
    return leftDue < rightDue ? -1 : 1;
  }
  return left.title.localeCompare(right.title);
}

function groupByNote(rows: readonly TaskRow[], settling: ReadonlySet<string>): TaskGroup[] {
  const notes = new Map<string, TaskRow[]>();
  const detached: TaskRow[] = [];
  const completed: TaskRow[] = [];
  for (const row of rows) {
    if (row.done && !settling.has(row.id)) {
      completed.push(row);
    } else if (row.noteId === null) {
      detached.push(row);
    } else {
      const bucket = notes.get(row.noteId) ?? [];
      bucket.push(row);
      notes.set(row.noteId, bucket);
    }
  }
  const groups: TaskGroup[] = [...notes].map(([noteId, bucket]) => ({
    id: `note-${noteId}`,
    kind: "note",
    title: bucket[0]?.noteTitle ?? "Untitled",
    rows: bucket,
    noteId,
    folderTitle: bucket[0]?.folderTitle ?? null,
  }));
  groups.sort(noteGroupOrder);
  if (detached.length > 0) groups.push(group("detached", detached));
  if (completed.length > 0) groups.push(group("completed", completed.sort(mostRecentFirst)));
  return groups;
}

/**
 * @name groupTasks
 * @description Splits rows into the ledger's groups. By due date: Overdue,
 * Today, Upcoming, No date, then Completed; work completed and due today stays
 * in Today. By note: one group per source note ordered by its earliest due
 * date, then Detached, then Completed. A row in `settling` was just completed
 * and keeps its place until it folds away.
 *
 * @example
 * groupTasks(rows, "due", "2026-11-08", new Set());
 */
export function groupTasks(
  rows: readonly TaskRow[],
  grouping: TaskGrouping,
  today: DateKey,
  settling: ReadonlySet<string> = NO_SETTLING,
): TaskGroup[] {
  return grouping === "due" ? groupByDue(rows, today, settling) : groupByNote(rows, settling);
}

/**
 * @name summarizeTasks
 * @description The header's counts: open tasks, open tasks past their date,
 * and tasks completed today, read from when a completed task last changed.
 *
 * @example
 * summarizeTasks(rows, "2026-11-08"); // { open: 4, overdue: 1, doneToday: 2 }
 */
export function summarizeTasks(rows: readonly TaskRow[], today: DateKey): TaskSummary {
  let open = 0;
  let overdue = 0;
  let doneToday = 0;
  for (const row of rows) {
    if (!row.done) {
      open += 1;
      if (row.dueDate !== null && row.dueDate < today) overdue += 1;
    } else if (dateKeyOf(new Date(row.updatedAt)) === today) {
      doneToday += 1;
    }
  }
  return { open, overdue, doneToday };
}

/**
 * @name upcomingWeek
 * @description The seven days after today with how many open tasks fall due
 * on each, for the Upcoming margin's strip.
 *
 * @example
 * upcomingWeek(rows, "2026-11-08")[0]; // { dueDate: "2026-11-09", count: 2 }
 */
export function upcomingWeek(rows: readonly TaskRow[], today: DateKey): WeekDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const dueDate = shiftDay(today, index + 1);
    return {
      dueDate,
      count: rows.filter((row) => !row.done && row.dueDate === dueDate).length,
    };
  });
}

/**
 * @name oldestLateness
 * @description How many days the longest-overdue open row is late.
 *
 * @example
 * oldestLateness(overdueRows, "2026-11-08"); // 6
 */
export function oldestLateness(rows: readonly TaskRow[], today: DateKey): number {
  return rows.reduce(
    (oldest, row) =>
      row.dueDate === null || row.done ? oldest : Math.max(oldest, daysLate(row.dueDate, today)),
    0,
  );
}

/**
 * @name visibleRowIds
 * @description The ids of the rows the list shows, in screen order, which is
 * the order arrow keys and the detail sheet's previous and next follow. The
 * Completed group's older rows count only while it is expanded.
 *
 * @example
 * visibleRowIds(groups, false);
 */
export function visibleRowIds(groups: readonly TaskGroup[], completedOpen: boolean): string[] {
  return groups.flatMap((entry) => {
    const rows =
      entry.kind === "completed" && !completedOpen
        ? entry.rows.slice(0, COMPLETED_PREVIEW)
        : entry.rows;
    return rows.map((row) => row.id);
  });
}

export type DueState = "none" | "late" | "today" | "later" | "done";

/**
 * @name dueState
 * @description The tone a row's date is drawn in: late, today, later, or
 * done once the task is complete.
 *
 * @example
 * dueState(row, "2026-11-08"); // "late"
 */
export function dueState(row: TaskRow, today: DateKey): DueState {
  if (row.dueDate === null) return "none";
  if (row.done) return "done";
  if (row.dueDate < today) return "late";
  return row.dueDate === today ? "today" : "later";
}

/**
 * @name dueText
 * @description The label a row shows for its date: "3 days late", "Today",
 * "Tue", or "Add date" when it has none.
 *
 * @example
 * dueText(row, "2026-11-08"); // "3 days late"
 */
export function dueText(row: TaskRow, today: DateKey): string {
  if (row.dueDate === null) return "Add date";
  const late = row.done ? 0 : daysLate(row.dueDate, today);
  if (late > 0) return late === 1 ? "1 day late" : `${late} days late`;
  return formatDueLabel(row.dueDate, today);
}
