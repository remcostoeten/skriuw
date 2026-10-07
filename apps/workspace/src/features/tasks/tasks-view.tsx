import "./tasks.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouteFocus } from "@/app-route";
import { requestBlockReveal } from "@/features/editor/reveal-controller";
import { activateReference } from "@/features/references/shell";
import { ListTodoIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { flushPendingWork } from "@/store/pending-work";
import { WindowControls } from "@/shell/title-bar";
import { commitOperations } from "@/store/commit";
import { todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { describeDueDate, dueBucket, formatDueLabel, isDueDate } from "./due-dates";
import { buildTaskDueDate, buildTaskToggle, type TaskWriteResult } from "./operations";
import { flattenTaskRows, projectTasks, taskGroupsEqual, type TaskRow } from "./model";

const columnClass = "mx-auto w-[min(100%,720px)] px-[clamp(20px,4vw,40px)]";

type TasksViewProps = {
  store: RendererStore;
};

function rowElement(host: HTMLElement | null, taskId: string): HTMLInputElement | null {
  return host?.querySelector<HTMLInputElement>(`[data-task-id="${CSS.escape(taskId)}"]`) ?? null;
}

function millisecondsUntilTomorrow(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime() + 1000;
}

function useToday(): DateKey {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const timer = window.setTimeout(() => setToday(todayKey()), millisecondsUntilTomorrow());
    return () => window.clearTimeout(timer);
  }, [today]);
  return today;
}

export function TasksView({ store }: TasksViewProps) {
  const today = useToday();
  const selectGroups = useCallback((state: RendererState) => projectTasks(state, today), [today]);
  const groups = useRendererSelector(store, selectGroups, taskGroupsEqual);
  const rows = useMemo(() => flattenTaskRows(groups), [groups]);
  const indexById = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows]);
  const focusId = useRouteFocus();
  const [notice, setNotice] = useState<string | null>(null);
  const revealedFocusId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openCount = rows.filter((row) => !row.done).length;

  useEffect(() => {
    if (focusId === null) {
      revealedFocusId.current = null;
      return;
    }
    if (revealedFocusId.current === focusId) return;
    const target = rowElement(listRef.current, focusId);
    if (target) {
      revealedFocusId.current = focusId;
      target.scrollIntoView({ block: "center" });
      target.focus();
    }
  }, [focusId, rows]);

  function focusRow(index: number): void {
    const clamped = Math.max(0, Math.min(rows.length - 1, index));
    const target = rows[clamped];
    if (target) {
      rowElement(listRef.current, target.id)?.focus();
    }
  }

  /**
   * Persists any debounced editor save before reading the document, so the
   * paired write starts from the revision the backend is about to hold rather
   * than one the open editor has already moved past.
   */
  async function writeTask(row: TaskRow, build: () => TaskWriteResult): Promise<void> {
    try {
      await flushPendingWork();
    } catch (error) {
      console.error("task write could not flush pending saves", error);
      setNotice("Changes to the source note are not saved yet, so this task was left alone.");
      return;
    }
    const result = build();
    if (result.status === "refused") {
      setNotice(result.message);
      return;
    }
    setNotice(null);
    commitOperations(store, result.operations).catch((error: unknown) => {
      console.error("task write rejected", error);
      setNotice("That change could not be saved.");
    });
    window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active !== null && active !== document.body) return;
      rowElement(listRef.current, row.id)?.focus();
    });
  }

  function toggle(row: TaskRow): Promise<void> {
    return writeTask(row, () => buildTaskToggle(store.getState(), row.id, Date.now()));
  }

  function setDueDate(row: TaskRow, dueDate: DateKey | null): Promise<void> {
    if (dueDate === row.dueDate) return Promise.resolve();
    return writeTask(row, () => buildTaskDueDate(store.getState(), row.id, dueDate, Date.now()));
  }

  function openSource(row: TaskRow): void {
    if (row.noteId === null || row.blockId === null) {
      return;
    }
    requestBlockReveal(row.noteId, row.blockId);
    activateReference(store, "note", row.noteId);
  }

  return (
    <main
      className="relative col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
      aria-labelledby="tasks-title"
    >
      <WindowControls className="absolute right-0 top-0" />
      <header className={cn(columnClass, "pb-5 pt-[38px]")}>
        <div className="flex items-center gap-2">
          <h1 id="tasks-title" className="text-2xl font-[650] tracking-[-0.035em] text-foreground">
            Tasks
          </h1>
        </div>
        <p className="mt-1 max-w-xl text-xs leading-[1.45] text-theme-secondary">
          {rows.length === 0
            ? "A little space for what’s next."
            : `${openCount} remaining · ${rows.length - openCount} completed`}
        </p>
        {notice && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {notice}
          </p>
        )}
      </header>

      {rows.length === 0 ? (
        <div
          role="status"
          className="w-[min(380px,calc(100%-40px))] place-self-center text-center text-theme-secondary"
        >
          <span className="mb-3.5 inline-flex text-theme-dim" aria-hidden="true">
            <ListTodoIcon size={22} />
          </span>
          <h2 className="text-[15px] font-[620] text-foreground">No tasks yet</h2>
          <p className="mt-1.5 text-xs leading-[1.45]">
            Type <code className="font-mono">- []</code> in a note, or run the task slash command,
            to turn a checklist item into a task.
          </p>
        </div>
      ) : (
        <div
          ref={listRef}
          className="min-h-0 overflow-y-auto"
          aria-describedby="tasks-keyboard-help"
        >
          <div className={cn(columnClass, "py-2")}>
            {groups.map((group) => (
              <section key={group.bucket} className="mb-6" data-task-group={group.bucket}>
                <h2
                  className={cn(
                    "flex min-h-9 items-center gap-2 px-2 text-xs font-medium text-theme-secondary",
                    group.bucket === "overdue" && "text-destructive",
                  )}
                >
                  <span className="truncate">{group.label}</span>
                  <span className="font-mono text-[10px] text-theme-dim">{group.rows.length}</span>
                </h2>
                <ul aria-label={group.label}>
                  {group.rows.map((row) => (
                    <TaskListRow
                      key={row.id}
                      row={row}
                      today={today}
                      index={indexById.get(row.id) ?? 0}
                      lastIndex={rows.length - 1}
                      onToggle={() => void toggle(row)}
                      onSetDueDate={(dueDate) => void setDueDate(row, dueDate)}
                      onOpenSource={() => openSource(row)}
                      onFocusRow={focusRow}
                    />
                  ))}
                </ul>
              </section>
            ))}
            <p
              id="tasks-keyboard-help"
              className="tasks-keyboard-help flex flex-wrap gap-x-[18px] gap-y-3 px-2 pb-5 pt-3 text-[11px] text-theme-secondary"
            >
              <span>
                <kbd>↑</kbd> <kbd>↓</kbd> Move
              </span>
              <span>
                <kbd>Space</kbd> Complete
              </span>
              <span>
                <kbd>Enter</kbd> Open note
              </span>
              <span>
                <kbd>D</kbd> Due date
              </span>
              <span>
                <kbd>Tab</kbd> Next control
              </span>
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

type RowProps = {
  row: TaskRow;
  today: DateKey;
  index: number;
  lastIndex: number;
  onToggle: () => void;
  onSetDueDate: (dueDate: DateKey | null) => void;
  onOpenSource: () => void;
  onFocusRow: (index: number) => void;
};

function TaskListRow({
  row,
  today,
  index,
  lastIndex,
  onToggle,
  onSetDueDate,
  onOpenSource,
  onFocusRow,
}: RowProps) {
  const linked = row.noteId !== null && row.blockId !== null;
  const [editingDate, setEditingDate] = useState(false);
  return (
    <li
      className="task-row group/row flex min-h-12 items-center gap-3 rounded-[10px] px-2 py-0.5 focus-within:bg-[hsl(var(--foreground)/0.045)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[hsl(var(--foreground)/0.03)]"
      data-completed={row.done}
    >
      <label className="task-row-label group/label flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          data-task-id={row.id}
          className="task-checkbox relative m-0 size-5 flex-none cursor-pointer appearance-none rounded-[7px] border-[1.5px] border-solid border-theme-secondary bg-theme-editor outline-none transition-[border-color,background-color] duration-[120ms] ease-[ease] checked:border-success checked:bg-success focus-visible:border-success focus-visible:bg-[hsl(var(--success)/0.14)] checked:focus-visible:bg-success checked:focus-visible:brightness-[1.12] [@media(hover:hover)_and_(pointer:fine)]:group-hover/label:not-checked:border-[hsl(var(--success)/0.7)] [@media(hover:hover)_and_(pointer:fine)]:active:not-focus-visible:scale-[0.94]"
          checked={row.done}
          aria-label={row.title}
          aria-describedby="tasks-keyboard-help"
          onChange={onToggle}
          onKeyDown={(event) => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === "d" || event.key === "D") {
              event.preventDefault();
              setEditingDate(true);
            } else if (event.key === "Enter" && linked) {
              event.preventDefault();
              onOpenSource();
            } else if (event.key === "Home" || (event.key === "ArrowUp" && event.shiftKey)) {
              event.preventDefault();
              onFocusRow(0);
            } else if (event.key === "End" || (event.key === "ArrowDown" && event.shiftKey)) {
              event.preventDefault();
              onFocusRow(lastIndex);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              onFocusRow(index + 1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              onFocusRow(index - 1);
            }
          }}
        />
        <span className="task-row-title min-w-0 py-2 text-[14px] leading-[1.5] text-foreground [overflow-wrap:anywhere] group-data-[completed=true]/row:text-theme-secondary group-data-[completed=true]/row:line-through group-data-[completed=true]/row:decoration-[hsl(var(--theme-text-secondary)/0.5)]">
          {row.title}
        </span>
      </label>
      <DueDateControl
        row={row}
        today={today}
        editing={editingDate}
        onEditingChange={setEditingDate}
        onCommit={onSetDueDate}
      />
      {linked ? (
        <button
          type="button"
          className="task-source inline-flex min-h-8 flex-none cursor-pointer items-center gap-[5px] rounded-[6px] px-2 py-1 text-[11px] text-theme-secondary [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          aria-label={`Open source note for ${row.title}: ${row.noteTitle}`}
          title={`Open ${row.noteTitle}`}
          onClick={onOpenSource}
        >
          <span aria-hidden="true">↗</span>
          <span className="task-source-label max-w-[160px] truncate max-[480px]:hidden">
            {row.noteTitle}
          </span>
        </button>
      ) : (
        <span className="shrink-0 px-1.5 text-[11px] text-theme-dim">
          {row.detached ? "Detached" : "No source"}
        </span>
      )}
    </li>
  );
}

type DueDateControlProps = {
  row: TaskRow;
  today: DateKey;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onCommit: (dueDate: DateKey | null) => void;
};

function DueDateControl({ row, today, editing, onEditingChange, onCommit }: DueDateControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (!editing) return;
    settled.current = false;
    inputRef.current?.focus();
  }, [editing]);

  function finish(commit: boolean, returnFocus: boolean): void {
    if (settled.current) return;
    settled.current = true;
    const next = inputRef.current?.value.trim() ?? "";
    const checkbox = inputRef.current
      ?.closest("li")
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    onEditingChange(false);
    if (returnFocus) {
      window.requestAnimationFrame(() => checkbox?.focus());
    }
    if (!commit) return;
    if (next === "") {
      onCommit(null);
    } else if (isDueDate(next)) {
      onCommit(next);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        defaultValue={row.dueDate ?? ""}
        aria-label={`Due date for ${row.title}. Enter saves, Escape cancels, an empty date clears it.`}
        className="task-due-input min-h-8 flex-none rounded-[6px] border border-border bg-theme-editor px-2 text-[12px] text-foreground"
        onBlur={() => finish(true, false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finish(true, true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false, true);
          }
        }}
      />
    );
  }

  const bucket = dueBucket(row.dueDate, row.done, today);
  return (
    <button
      type="button"
      data-due-state={bucket}
      className={cn(
        "task-due inline-flex min-h-8 flex-none cursor-pointer items-center rounded-[6px] px-2 py-1 text-[11px] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted",
        row.dueDate === null
          ? "text-theme-dim opacity-0 group-focus-within/row:opacity-100 focus-visible:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover/row:opacity-100"
          : bucket === "overdue"
            ? "text-destructive"
            : bucket === "today"
              ? "text-foreground"
              : "text-theme-secondary",
      )}
      aria-label={
        row.dueDate === null
          ? `Add a due date to ${row.title}`
          : `${describeDueDate(row.dueDate, row.done, today)}. Change the due date of ${row.title}, or press Delete to clear it`
      }
      title={row.dueDate === null ? "Add due date" : describeDueDate(row.dueDate, row.done, today)}
      onClick={() => onEditingChange(true)}
      onKeyDown={(event) => {
        if (event.key === "Delete" && row.dueDate !== null) {
          event.preventDefault();
          onCommit(null);
        }
      }}
    >
      {row.dueDate === null ? "Add date" : formatDueLabel(row.dueDate, today)}
    </button>
  );
}
