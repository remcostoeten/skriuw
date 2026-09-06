import "./tasks.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouteFocus } from "@/app-route";
import { requestBlockReveal } from "@/features/editor/reveal-controller";
import { activateReference } from "@/features/references/reference-navigation";
import { ListTodoIcon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";
import { flushPendingWork } from "@/shell/pending-work";
import { WindowControls } from "@/shell/window-controls";
import { commitOperations } from "@/store/actions/workspace";
import type { RendererStore } from "@/store/types";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { buildTaskToggle } from "./task-operations";
import { flattenTaskRows, projectTasks, taskGroupsEqual, type TaskRow } from "./tasks-model";

const columnClass = "mx-auto w-[min(100%,720px)] px-[clamp(20px,4vw,40px)]";

type TasksViewProps = {
  store: RendererStore;
};

function rowElement(host: HTMLElement | null, taskId: string): HTMLInputElement | null {
  return host?.querySelector<HTMLInputElement>(`[data-task-id="${CSS.escape(taskId)}"]`) ?? null;
}

export function TasksView({ store }: TasksViewProps) {
  const groups = useRendererSelector(store, projectTasks, taskGroupsEqual);
  const rows = useMemo(() => flattenTaskRows(groups), [groups]);
  const indexById = useMemo(
    () => new Map(rows.map((row, index) => [row.id, index])),
    [rows],
  );
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
  async function toggle(row: TaskRow): Promise<void> {
    try {
      await flushPendingWork();
    } catch (error) {
      console.error("task toggle could not flush pending saves", error);
      setNotice("Changes to the source note are not saved yet, so this task was left alone.");
      return;
    }
    const result = buildTaskToggle(store.getState(), row.id, Date.now());
    if (result.status === "refused") {
      setNotice(result.message);
      return;
    }
    setNotice(null);
    commitOperations(store, result.operations).catch((error: unknown) => {
      console.error("task toggle rejected", error);
      setNotice("That change could not be saved.");
    });
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
          {rows.length === 0 ? "A little space for what’s next." : `${openCount} remaining · ${rows.length - openCount} completed`}
        </p>
        {notice && <p role="alert" className="mt-3 text-xs text-destructive">{notice}</p>}
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
        <div ref={listRef} className="min-h-0 overflow-y-auto" aria-describedby="tasks-keyboard-help">
          <div className={cn(columnClass, "py-2")}>
            {groups.map((group) => (
              <section key={group.noteId ?? "unsourced"} className="mb-6">
                <h2 className="flex min-h-9 items-center gap-2 px-2 text-xs font-medium text-theme-secondary">
                  <span className="truncate">{group.noteTitle}</span>
                  <span className="font-mono text-[10px] text-theme-dim">{group.rows.length}</span>
                </h2>
                <ul aria-label={group.noteTitle}>
                  {group.rows.map((row) => (
                    <TaskListRow
                      key={row.id}
                      row={row}
                      index={indexById.get(row.id) ?? 0}
                      lastIndex={rows.length - 1}
                      onToggle={() => void toggle(row)}
                      onOpenSource={() => openSource(row)}
                      onFocusRow={focusRow}
                    />
                  ))}
                </ul>
              </section>
            ))}
            <p id="tasks-keyboard-help" className="tasks-keyboard-help">
              <span><kbd>↑</kbd> <kbd>↓</kbd> Move</span>
              <span><kbd>Space</kbd> Complete</span>
              <span><kbd>Enter</kbd> Open note</span>
              <span><kbd>Tab</kbd> Next control</span>
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

type RowProps = {
  row: TaskRow;
  index: number;
  lastIndex: number;
  onToggle: () => void;
  onOpenSource: () => void;
  onFocusRow: (index: number) => void;
};

function TaskListRow({ row, index, lastIndex, onToggle, onOpenSource, onFocusRow }: RowProps) {
  const linked = row.noteId !== null && row.blockId !== null;
  return (
    <li className="task-row" data-completed={row.done}>
      <label className="task-row-label">
        <input
          type="checkbox"
          data-task-id={row.id}
          className="task-checkbox"
          checked={row.done}
          aria-label={row.title}
          aria-describedby="tasks-keyboard-help"
          onChange={onToggle}
          onKeyDown={(event) => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === "Enter" && linked) {
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
        <span className="task-row-title">{row.title}</span>
      </label>
      {linked ? (
        <button
          type="button"
          className="task-source"
          aria-label={`Open source note for ${row.title}: ${row.noteTitle}`}
          title={`Open ${row.noteTitle}`}
          onClick={onOpenSource}
        >
          <span aria-hidden="true">↗</span>
          <span className="task-source-label">Open note</span>
        </button>
      ) : (
        <span className="shrink-0 px-1.5 text-[11px] text-theme-dim">
          {row.detached ? "Detached" : "No source"}
        </span>
      )}
    </li>
  );
}
