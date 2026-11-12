import { memo } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import type { DateKey } from "@skriuw/renderer-core/journal/dates";
import { describeDueDate } from "@skriuw/renderer-core/tasks/due-dates";
import { formatRecurrenceLabel } from "@skriuw/renderer-core/tasks/recurrence";
import { AlignLeftIcon, FileTextIcon, RepeatIcon, SquareCheckIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { dueState, dueText, type TaskRow } from "@skriuw/renderer-core/tasks/rows";

export type TaskRowActions = {
  toggle: (id: string) => void;
  openDetail: (id: string, focusTitle: boolean) => void;
  openDue: (id: string, anchor: HTMLElement) => void;
  clearDue: (id: string) => void;
  openSource: (id: string) => void;
  move: (id: string, direction: "previous" | "next" | "first" | "last") => void;
};

type Props = {
  row: TaskRow;
  today: DateKey;
  showSource: boolean;
  selected: boolean;
  lit: boolean;
  leaving: boolean;
  actions: TaskRowActions;
};

export function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.4l2.9 2.9L12.6 5" />
    </svg>
  );
}

function linkNote(row: TaskRow): string | null {
  if (row.link === "detached") return "Detached from its note";
  if (row.link === "orphaned") return "Its note was deleted";
  if (row.link === "none") return "Not in a note";
  return null;
}

function TaskMeta({ row, showSource, actions }: Pick<Props, "row" | "showSource" | "actions">) {
  const parts = [];
  const priorityShown = !row.done && (row.priority === "high" || row.priority === "urgent");
  if (!row.done && row.status === "in_progress") {
    parts.push(
      <span key="status" className="inline-flex items-center gap-[5px] text-theme-secondary">
        <i aria-hidden="true" className="size-1.5 rounded-full bg-status-progress" />
        In progress
      </span>,
    );
  }
  if (priorityShown) {
    parts.push(
      <span
        key="priority"
        className={cn(
          "font-medium",
          row.priority === "urgent" ? "text-destructive" : "text-warning",
        )}
      >
        {row.priority === "urgent" ? "Urgent" : "High"}
      </span>,
    );
  }
  const missing = linkNote(row);
  if (missing !== null) {
    parts.push(
      <span key="source" className="italic">
        {missing}
      </span>,
    );
  } else if (showSource) {
    parts.push(
      <button
        key="source"
        type="button"
        tabIndex={-1}
        data-task-source=""
        className="inline-flex max-w-[260px] cursor-pointer items-center gap-1 rounded border-0 bg-transparent p-0 text-theme-secondary transition-colors duration-150 hover:text-foreground"
        title={`Open ${row.noteTitle} at this task`}
        onClick={(event) => {
          event.stopPropagation();
          actions.openSource(row.id);
        }}
      >
        <FileTextIcon size={11} className="flex-none" />
        <span className="truncate">{row.noteTitle}</span>
      </button>,
    );
  }
  if (row.recurrence !== null) {
    parts.push(
      <span key="repeat" className="inline-flex items-center gap-1">
        <RepeatIcon size={11} />
        {formatRecurrenceLabel(row.recurrence)}
      </span>,
    );
  }
  if (row.subtasksTotal > 0) {
    parts.push(
      <span key="subtasks" className="inline-flex items-center gap-1 tabular-nums">
        <SquareCheckIcon size={11} />
        <span className="sr-only">Subtasks</span>
        {row.subtasksDone}/{row.subtasksTotal}
      </span>,
    );
  }
  if (row.description.trim().length > 0) {
    parts.push(
      <span key="notes" className="inline-flex items-center" title="Has notes">
        <AlignLeftIcon size={11} />
        <span className="sr-only">Has notes</span>
      </span>,
    );
  }
  const [firstTag] = row.tags;
  if (firstTag !== undefined) {
    parts.push(
      <span key="tags" className="text-reference-tag">
        #{firstTag}
        {row.tags.length > 1 ? ` +${row.tags.length - 1}` : ""}
      </span>,
    );
  }
  return (
    <div
      id={`task-meta-${row.id}`}
      className="flex flex-wrap empty:hidden items-center gap-x-3 gap-y-0.5 text-[11.5px] text-theme-dim"
    >
      {parts}
    </div>
  );
}

function onRowKeyDown(
  event: ReactKeyboardEvent<HTMLInputElement>,
  row: TaskRow,
  actions: TaskRowActions,
) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key;
  if (key === "ArrowDown" || key === "ArrowUp") {
    event.preventDefault();
    const down = key === "ArrowDown";
    actions.move(row.id, event.shiftKey ? (down ? "last" : "first") : down ? "next" : "previous");
  } else if (key === "Enter") {
    event.preventDefault();
    actions.openDetail(row.id, false);
  } else if (key === "ArrowRight") {
    event.preventDefault();
    actions.openDetail(row.id, true);
  } else if (key === "d" || key === "D") {
    event.preventDefault();
    const anchor = event.currentTarget.closest("li")?.querySelector<HTMLElement>("[data-task-due]");
    if (anchor) actions.openDue(row.id, anchor);
  } else if (key === "o" || key === "O") {
    event.preventDefault();
    actions.openSource(row.id);
  }
}

function onRowClick(event: ReactMouseEvent<HTMLDivElement>, row: TaskRow, actions: TaskRowActions) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".task-checkbox, .task-check, [data-task-due], [data-task-source]")) return;
  actions.openDetail(row.id, false);
  event.currentTarget.querySelector<HTMLInputElement>(".task-checkbox")?.focus({
    preventScroll: true,
  });
}

function TaskListItemBase({ row, today, showSource, selected, lit, leaving, actions }: Props) {
  const state = dueState(row, today);
  const checkboxId = `task-checkbox-${row.id}`;
  return (
    <li
      className="task-item"
      data-task-row={row.id}
      data-done={row.done}
      data-selected={selected}
      data-lit={lit}
      data-leaving={leaving}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="task-item-inner" onClick={(event) => onRowClick(event, row, actions)}>
          <input
            id={checkboxId}
            type="checkbox"
            className="task-checkbox"
            data-task-id={row.id}
            checked={row.done}
            aria-label={row.title}
            aria-describedby={`task-meta-${row.id} tasks-keyboard-help`}
            onChange={() => actions.toggle(row.id)}
            onKeyDown={(event) => onRowKeyDown(event, row, actions)}
          />
          <label htmlFor={checkboxId} className="task-check" aria-hidden="true">
            <CheckMark />
          </label>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <span className="task-title">{row.title}</span>
            <TaskMeta row={row} showSource={showSource} actions={actions} />
          </div>
          <button
            type="button"
            data-task-due=""
            data-state={state}
            className={cn(
              "task-due -mt-0.5 min-h-[26px] cursor-pointer whitespace-nowrap rounded-md border-0 bg-transparent px-2 text-xs tabular-nums transition-[background-color,color,opacity] duration-150 hover:bg-theme-hover hover:text-foreground",
              state === "late" && "text-destructive",
              state === "today" && "text-foreground",
              state === "later" && "text-theme-secondary",
              (state === "none" || state === "done") && "text-theme-dim",
            )}
            aria-label={
              row.dueDate === null
                ? `Add a due date to ${row.title}`
                : `${describeDueDate(row.dueDate, row.done, today)}. Change the due date of ${row.title}, or press Delete to clear it`
            }
            onClick={(event) => actions.openDue(row.id, event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Delete" && row.dueDate !== null) {
                event.preventDefault();
                actions.clearDue(row.id);
              }
            }}
          >
            {dueText(row, today)}
          </button>
        </div>
      </div>
    </li>
  );
}

export const TaskListItem = memo(TaskListItemBase);
