import "./tasks.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { TaskStatus } from "@skriuw/renderer-core/contracts/workspace";
import { formatLongDate, todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { requestBlockReveal } from "@/features/editor/reveal-controller";
import { activateReference } from "@/features/references/shell";
import { CalendarIcon, FileTextIcon, ListTodoIcon, SearchIcon } from "@/shared/icons/static";
import { useRouteFocus } from "@/shared/routing/app-route";
import { cn } from "@/shared/styling/class-names";
import { LedgerOutline } from "@/shared/ui/ledger-outline";
import { SegmentedControl, settingsTransition } from "@/shared/ui/settings-controls";
import { createLedgerRegistry } from "@/shared/ui/settings-ledger";
import { showToast } from "@/shared/ui/toast";
import { WindowControlsSlot } from "@/shared/ui/window-controls-slot";
import { commitOperations } from "@/store/commit";
import { flushPendingWork } from "@/store/pending-work";
import { DueDatePopover } from "./due-date-popover";
import { isTypingTarget } from "./keyboard";
import {
  applyTaskOverlay,
  filterTaskRows,
  groupTasks,
  projectTaskRows,
  summarizeTasks,
  taskRowsEqual,
  visibleRowIds,
  type TaskGrouping,
  type TaskOverlay,
} from "./model";
import {
  buildSubtaskAdd,
  buildSubtaskToggle,
  buildTaskDueDates,
  buildTaskFields,
  buildTaskRecurrence,
  buildTaskStatus,
  buildTaskTitle,
  type TaskDueChange,
  type TaskFieldPatch,
  type TaskWriteResult,
} from "./operations";
import { TaskDetailSheet, type TaskSheetActions } from "./task-detail-sheet";
import { TaskGroupSection, groupDomId, type TaskGroupActions } from "./task-group";
import type { TaskRowActions } from "./task-row";
import { createTaskWriter } from "./writer";

const SETTLE_MS = 1_100;
const FOLD_MS = 240;
const SHEET_CLOSE_MS = 150;

type Props = {
  store: RendererStore;
};

type PopoverTarget = {
  taskId: string;
  anchor: HTMLElement;
  fromSheet: boolean;
};

type Undo = {
  run: () => void;
  dismiss: () => void;
};

const GROUPINGS = [
  { value: "due", label: "Due date" },
  { value: "note", label: "Note" },
] as const;

const tabClass = cn(
  "flex min-h-8 w-full cursor-pointer items-center gap-[9px] rounded-[7px] border-0 bg-transparent px-[9px] py-[5px] text-left text-[13px] text-theme-secondary hover:bg-theme-hover/55 hover:text-foreground aria-selected:bg-theme-hover aria-selected:text-foreground",
  settingsTransition,
);

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

function checkboxFor(taskId: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    `.task-checkbox[data-task-id="${CSS.escape(taskId)}"]`,
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function withEntry<Value>(set: ReadonlySet<Value>, value: Value): ReadonlySet<Value> {
  return set.has(value) ? set : new Set([...set, value]);
}

function withoutEntry<Value>(set: ReadonlySet<Value>, value: Value): ReadonlySet<Value> {
  if (!set.has(value)) return set;
  const next = new Set(set);
  next.delete(value);
  return next;
}

export function TasksView({ store }: Props) {
  const today = useToday();
  const rows = useRendererSelector(store, projectTaskRows, taskRowsEqual);
  const focusId = useRouteFocus();
  const [grouping, setGrouping] = useState<TaskGrouping>("due");
  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<ReadonlyMap<string, TaskOverlay>>(new Map());
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set());
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const [completedOpen, setCompletedOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DateKey | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [popover, setPopover] = useState<PopoverTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [registry] = useState(createLedgerRegistry);
  const [writer] = useState(() =>
    createTaskWriter(store, { flush: flushPendingWork, commit: commitOperations }),
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef(new Map<string, number[]>());
  const closeTimerRef = useRef(0);
  const undoRef = useRef<Undo | null>(null);
  const revealedFocusId = useRef<string | null>(null);
  const focusedRowRef = useRef<string | null>(null);

  const shown = useMemo(() => applyTaskOverlay(rows, overlay), [rows, overlay]);
  const filtered = useMemo(() => filterTaskRows(shown, query), [shown, query]);
  const groups = useMemo(
    () => groupTasks(filtered, grouping, today, settling),
    [filtered, grouping, today, settling],
  );
  const ids = useMemo(() => visibleRowIds(groups, completedOpen), [groups, completedOpen]);
  const rowById = useMemo(() => new Map(shown.map((row) => [row.id, row])), [shown]);
  const summary = summarizeTasks(shown, today);
  const noteCount = new Set(shown.filter((row) => !row.done).map((row) => row.noteId)).size;

  const latest = useRef({ ids, rowById, detailId, popover, query, grouping, today });
  latest.current = { ids, rowById, detailId, popover, query, grouping, today };

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const handles of timers.values())
        handles.forEach((handle) => window.clearTimeout(handle));
      window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (focusId === null) {
      revealedFocusId.current = null;
      return;
    }
    if (revealedFocusId.current === focusId) return;
    const target = checkboxFor(focusId);
    if (target) {
      revealedFocusId.current = focusId;
      target.scrollIntoView({ block: "center" });
      target.focus();
    }
  }, [focusId, ids]);

  useLayoutEffect(() => {
    const id = focusedRowRef.current;
    const active = document.activeElement;
    if (id === null || (active !== null && active !== document.body)) return;
    const target = checkboxFor(id);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.closest("li")?.scrollIntoView({ block: "nearest" });
  }, [groups]);

  function patchOverlay(patches: ReadonlyMap<string, TaskOverlay>): void {
    if (patches.size === 0) return;
    setOverlay((current) => {
      const next = new Map(current);
      for (const [id, patch] of patches) next.set(id, { ...current.get(id), ...patch });
      return next;
    });
  }

  function dropOverlay(ids: readonly string[]): void {
    setOverlay((current) => {
      if (!ids.some((id) => current.has(id))) return current;
      const next = new Map(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  function submit(
    build: () => TaskWriteResult,
    readsDocument: boolean,
    patches: ReadonlyMap<string, TaskOverlay> = new Map(),
  ): Promise<boolean> {
    patchOverlay(patches);
    return writer.write(build, { readsDocument }).then((outcome) => {
      dropOverlay([...patches.keys()]);
      if (outcome.status === "refused") {
        setNotice(outcome.message);
        return false;
      }
      setNotice(null);
      outcome.committed.catch((error: unknown) => {
        console.error("task write rejected", error);
        setNotice("That change could not be saved.");
      });
      return true;
    });
  }

  function offerUndo(message: string, run: () => void): void {
    undoRef.current?.dismiss();
    let used = false;
    const undo: Undo = {
      run: () => {
        if (used) return;
        used = true;
        if (undoRef.current === undo) undoRef.current = null;
        run();
      },
      dismiss: () => undefined,
    };
    undo.dismiss = showToast({
      message,
      action: { label: "Undo", run: undo.run },
      durationMs: 5_000,
    });
    undoRef.current = undo;
  }

  function clearTimers(id: string): void {
    timersRef.current.get(id)?.forEach((handle) => window.clearTimeout(handle));
    timersRef.current.delete(id);
  }

  function unsettle(id: string): void {
    clearTimers(id);
    setSettling((current) => withoutEntry(current, id));
    setLeaving((current) => withoutEntry(current, id));
  }

  function finishFold(id: string): void {
    timersRef.current.delete(id);
    const row = document.querySelector(`[data-task-row="${CSS.escape(id)}"]`);
    if (row?.contains(document.activeElement)) {
      const order = latest.current.ids;
      const index = order.indexOf(id);
      const neighbour = order[index + 1] ?? order[index - 1];
      if (neighbour) checkboxFor(neighbour)?.focus({ preventScroll: true });
    }
    setSettling((current) => withoutEntry(current, id));
    setLeaving((current) => withoutEntry(current, id));
  }

  function settle(id: string): void {
    clearTimers(id);
    setSettling((current) => withEntry(current, id));
    const fold = window.setTimeout(() => {
      setLeaving((current) => withEntry(current, id));
    }, SETTLE_MS);
    const finish = window.setTimeout(() => finishFold(id), SETTLE_MS + FOLD_MS);
    timersRef.current.set(id, [fold, finish]);
  }

  function setStatus(id: string, status: TaskStatus, undoable = true): void {
    const row = latest.current.rowById.get(id);
    if (!row || row.status === status) return;
    const previous = row.status;
    const done = status === "done";
    const staysInToday = latest.current.grouping === "due" && row.dueDate === latest.current.today;
    if (done && !staysInToday) settle(id);
    if (!done) unsettle(id);
    void submit(
      () => buildTaskStatus(store.getState(), id, status, Date.now()),
      true,
      new Map([[id, { status }]]),
    ).then((applied) => {
      if (!applied) unsettle(id);
    });
    if (done && undoable) {
      offerUndo(`Completed “${row.title}”`, () => setStatus(id, previous, false));
    }
  }

  function setDueDates(changes: readonly TaskDueChange[], message: string, undoable = true): void {
    const before = changes.flatMap((change) => {
      const row = latest.current.rowById.get(change.taskId);
      return row && row.dueDate !== change.dueDate
        ? [{ taskId: row.id, dueDate: row.dueDate }]
        : [];
    });
    const effective = changes.filter((change) =>
      before.some((entry) => entry.taskId === change.taskId),
    );
    if (effective.length === 0) return;
    void submit(
      () => buildTaskDueDates(store.getState(), effective, Date.now()),
      true,
      new Map(effective.map((change) => [change.taskId, { dueDate: change.dueDate }])),
    );
    if (undoable) {
      offerUndo(message, () => setDueDates(before, "Due date restored", false));
    }
  }

  function setDue(id: string, dueDate: DateKey | null): void {
    setDueDates(
      [{ taskId: id, dueDate }],
      dueDate === null ? "Due date cleared" : `Due ${formatLongDate(dueDate)}`,
    );
  }

  function openSource(id: string): void {
    const row = latest.current.rowById.get(id);
    if (!row) return;
    if (row.noteId === null || row.blockId === null) {
      showToast({ message: "This task has no note to open." });
      return;
    }
    requestBlockReveal(row.noteId, row.blockId);
    activateReference(store, "note", row.noteId);
  }

  function focusRow(id: string): void {
    const target = checkboxFor(id);
    target?.focus({ preventScroll: true });
    target?.closest("li")?.scrollIntoView({ block: "nearest" });
  }

  function openDetail(id: string, focusTitle: boolean): void {
    window.clearTimeout(closeTimerRef.current);
    if (!focusTitle && latest.current.detailId === id) {
      closeDetail();
      return;
    }
    setClosing(false);
    setDetailId(id);
    setSheetId(id);
    if (focusTitle) {
      window.requestAnimationFrame(() =>
        document.querySelector<HTMLTextAreaElement>("[data-sheet-title]")?.focus(),
      );
    }
  }

  function closeDetail(): void {
    const id = latest.current.detailId;
    if (id === null) return;
    setDetailId(null);
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setClosing(false), SHEET_CLOSE_MS);
    focusRow(id);
  }

  function move(id: string, direction: "previous" | "next" | "first" | "last"): void {
    const order = latest.current.ids;
    const index = order.indexOf(id);
    const target =
      direction === "first"
        ? order[0]
        : direction === "last"
          ? order.at(-1)
          : order[Math.max(0, Math.min(order.length - 1, index + (direction === "next" ? 1 : -1)))];
    if (target === undefined) return;
    focusRow(target);
    if (latest.current.detailId !== null) {
      setDetailId(target);
      setSheetId(target);
    }
  }

  function openDue(id: string, anchor: HTMLElement): void {
    if (latest.current.popover?.taskId === id && latest.current.popover.anchor === anchor) {
      setPopover(null);
      return;
    }
    setPopover({ taskId: id, anchor, fromSheet: anchor.closest("[data-task-sheet]") !== null });
  }

  function closePopover(returnFocus: boolean): void {
    const target = latest.current.popover;
    setPopover(null);
    if (!returnFocus || !target) return;
    if (target.fromSheet) target.anchor.focus();
    else checkboxFor(target.taskId)?.focus({ preventScroll: true });
  }

  function switchGrouping(next: TaskGrouping): void {
    setGrouping(next);
    setSelectedDay(null);
    scrollerRef.current?.scrollTo({ top: 0 });
  }

  const actionsRef = useRef<{
    row: TaskRowActions;
    group: TaskGroupActions;
    sheet: TaskSheetActions;
  } | null>(null);
  const implementations = {
    toggle: (id: string) => {
      const row = latest.current.rowById.get(id);
      if (row) setStatus(id, row.done ? "todo" : "done");
    },
    openDetail,
    openDue,
    clearDue: (id: string) => setDue(id, null),
    openSource,
    move,
    moveOverdueToToday: () => {
      const overdue = groups.find((group) => group.kind === "overdue")?.rows ?? [];
      setDueDates(
        overdue.map((row) => ({ taskId: row.id, dueDate: today })),
        `Moved ${plural(overdue.length, "task")} to today`,
      );
    },
    toggleCompleted: () => setCompletedOpen((open) => !open),
    selectDay: (dueDate: DateKey) => {
      setSelectedDay((current) => (current === dueDate ? null : dueDate));
      const first = latest.current.ids.find(
        (id) => latest.current.rowById.get(id)?.dueDate === dueDate,
      );
      if (first) checkboxFor(first)?.closest("li")?.scrollIntoView({ block: "nearest" });
    },
    openNote: (noteId: string) => activateReference(store, "note", noteId),
    close: closeDetail,
    returnToRow: () => {
      const id = latest.current.detailId;
      if (id) window.requestAnimationFrame(() => focusRow(id));
    },
    navigate: (direction: "previous" | "next") => {
      const order = latest.current.ids;
      const current = latest.current.detailId;
      const target =
        current === null
          ? undefined
          : order[order.indexOf(current) + (direction === "next" ? 1 : -1)];
      if (target === undefined) return;
      setDetailId(target);
      setSheetId(target);
      checkboxFor(target)?.closest("li")?.scrollIntoView({ block: "nearest" });
    },
    setStatus: (id: string, status: TaskStatus) => setStatus(id, status),
    setTitle: (id: string, title: string) => {
      void submit(
        () => buildTaskTitle(store.getState(), id, title, Date.now()),
        true,
        new Map([[id, { title }]]),
      );
    },
    setFields: (id: string, patch: TaskFieldPatch) => {
      void submit(() => buildTaskFields(store.getState(), id, patch, Date.now()), false);
    },
    setRecurrence: (id: string, recurrence: string | null) => {
      void submit(() => buildTaskRecurrence(store.getState(), id, recurrence, Date.now()), true);
    },
    toggleSubtask: (id: string, path: { list: number; item: number }) => {
      void submit(() => buildSubtaskToggle(store.getState(), id, path, Date.now()), true);
    },
    addSubtask: (id: string, title: string) => {
      void submit(() => buildSubtaskAdd(store.getState(), id, title, Date.now()), true);
    },
  };
  const implementationsRef = useRef(implementations);
  implementationsRef.current = implementations;
  actionsRef.current ??= {
    row: {
      toggle: (id) => implementationsRef.current.toggle(id),
      openDetail: (id, focusTitle) => implementationsRef.current.openDetail(id, focusTitle),
      openDue: (id, anchor) => implementationsRef.current.openDue(id, anchor),
      clearDue: (id) => implementationsRef.current.clearDue(id),
      openSource: (id) => implementationsRef.current.openSource(id),
      move: (id, direction) => implementationsRef.current.move(id, direction),
    },
    group: {
      moveOverdueToToday: () => implementationsRef.current.moveOverdueToToday(),
      toggleCompleted: () => implementationsRef.current.toggleCompleted(),
      selectDay: (dueDate) => implementationsRef.current.selectDay(dueDate),
      openNote: (noteId) => implementationsRef.current.openNote(noteId),
    },
    sheet: {
      close: () => implementationsRef.current.close(),
      returnToRow: () => implementationsRef.current.returnToRow(),
      navigate: (direction) => implementationsRef.current.navigate(direction),
      openSource: (id) => implementationsRef.current.openSource(id),
      openDue: (id, anchor) => implementationsRef.current.openDue(id, anchor),
      setStatus: (id, status) => implementationsRef.current.setStatus(id, status),
      setTitle: (id, title) => implementationsRef.current.setTitle(id, title),
      setFields: (id, patch) => implementationsRef.current.setFields(id, patch),
      setRecurrence: (id, recurrence) => implementationsRef.current.setRecurrence(id, recurrence),
      toggleSubtask: (id, path) => implementationsRef.current.toggleSubtask(id, path),
      addSubtask: (id, title) => implementationsRef.current.addSubtask(id, title),
    },
  };
  const actions = actionsRef.current;

  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keyHandlerRef.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
    const typing = isTypingTarget(event.target);
    if (event.key === "Escape") {
      if (latest.current.popover) return;
      if (latest.current.detailId !== null && event.target !== searchRef.current) {
        event.preventDefault();
        closeDetail();
      } else if (latest.current.query.length > 0 && !typing) {
        event.preventDefault();
        setQuery("");
      }
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "z"
    ) {
      if (typing || undoRef.current === null) return;
      event.preventDefault();
      const undo = undoRef.current;
      undo.dismiss();
      undo.run();
      return;
    }
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "/") {
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    } else if (event.key === "g" || event.key === "G") {
      event.preventDefault();
      switchGrouping(latest.current.grouping === "due" ? "note" : "due");
    }
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      keyHandlerRef.current(event);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function scrollToGroup(groupId: string): void {
    const element = document.getElementById(groupDomId(groupId));
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }

  function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = grouping === "due" ? "note" : "due";
    switchGrouping(next);
    document.getElementById(`tasks-tab-${next}`)?.focus();
  }

  const detailState = detailId !== null ? "open" : closing ? "closing" : "";
  const shownSheetId = detailId ?? (closing ? sheetId : null);
  const sheetIndex = shownSheetId === null ? -1 : ids.indexOf(shownSheetId);
  const popoverRow = popover ? rowById.get(popover.taskId) : undefined;

  const summaryText =
    shown.length === 0
      ? "A little space for what’s next."
      : [
          `${summary.open} open`,
          summary.overdue > 0 ? `${summary.overdue} overdue` : null,
          `${summary.doneToday} done today`,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <main
      className="tasks-page relative col-[2/-1] grid min-h-0 min-w-0 grid-cols-[232px_minmax(0,1fr)] bg-theme-editor max-[860px]:grid-cols-1"
      aria-labelledby="tasks-title"
    >
      <nav
        aria-label="Tasks"
        className="flex min-h-0 flex-col border-r border-theme-divider bg-theme-deep px-2.5 pt-3 pb-2.5 text-theme-secondary max-[860px]:hidden"
      >
        <div className="group relative mx-0.5 mb-3.5 flex-none">
          <SearchIcon
            size={13}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-[9px] -translate-y-1/2 text-theme-secondary transition-colors duration-150 group-focus-within:text-foreground"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Filter tasks"
            aria-label="Filter tasks"
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-full rounded-lg border border-border bg-background py-0 pr-[30px] pl-[29px] text-[12.5px] text-foreground outline-0 transition-[border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] placeholder:text-theme-dim hover:border-theme-btn-outline focus-visible:border-ring [&::-webkit-search-cancel-button]:hidden"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setQuery("");
              } else if (event.key === "ArrowDown" || event.key === "Enter") {
                event.preventDefault();
                const first = ids[0];
                if (first) focusRow(first);
              }
            }}
          />
          <kbd
            aria-hidden="true"
            className="absolute top-1/2 right-[7px] -translate-y-1/2 transition-opacity duration-150 group-focus-within:opacity-0"
          >
            /
          </kbd>
        </div>
        <div className="px-[9px] pb-[5px] text-[11px] text-theme-dim">Group by</div>
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Group tasks by"
          className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto [scrollbar-width:thin]"
        >
          {GROUPINGS.map((entry) => {
            const active = grouping === entry.value;
            return [
              <button
                key={entry.value}
                id={`tasks-tab-${entry.value}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="tasks-list"
                tabIndex={active ? 0 : -1}
                className={tabClass}
                onClick={() => switchGrouping(entry.value)}
                onKeyDown={onTabKeyDown}
              >
                {entry.value === "due" ? (
                  <CalendarIcon size={15} aria-hidden="true" className="flex-none opacity-85" />
                ) : (
                  <FileTextIcon size={15} aria-hidden="true" className="flex-none opacity-85" />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <span className="text-[10.5px] tabular-nums text-theme-dim">
                  {(entry.value === "due" ? summary.open : noteCount) || ""}
                </span>
              </button>,
              <LedgerOutline
                key={`${entry.value}-outline`}
                open={active}
                registry={registry}
                scrollerRef={scrollerRef}
                onJump={scrollToGroup}
              />,
            ];
          })}
        </div>
        <p
          id="tasks-keyboard-help"
          className="flex flex-wrap gap-x-2.5 gap-y-[5px] px-1 pt-3 text-[10.5px] whitespace-nowrap text-theme-dim"
        >
          <span>
            <kbd>/</kbd> Filter
          </span>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> Move
          </span>
          <span>
            <kbd>Space</kbd> Done
          </span>
          <span>
            <kbd>D</kbd> Date
          </span>
          <span>
            <kbd>Enter</kbd> Details
          </span>
          <span>
            <kbd>O</kbd> Note
          </span>
          <span>
            <kbd>G</kbd> Group
          </span>
          <span>
            <kbd>Ctrl</kbd> <kbd>Z</kbd> Undo
          </span>
          <span className="sr-only">Shift with Up or Down jumps to the first or last task.</span>
        </p>
      </nav>

      <div
        className="tasks-pane relative grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto]"
        data-detail={detailState}
      >
        <div className="flex min-h-0 min-w-0 flex-col">
          <header
            className={cn(
              "relative flex h-[52px] flex-none items-center border-b px-10 transition-[border-color] duration-150 max-[860px]:px-5",
              scrolled ? "border-theme-divider" : "border-transparent",
            )}
          >
            <div className="mx-auto flex w-full max-w-[900px] min-w-0 items-center gap-3">
              <h1
                id="tasks-title"
                className="m-0 text-[15px] font-medium tracking-[-0.01em] text-foreground"
              >
                Tasks
              </h1>
              <p className="m-0 min-w-0 flex-1 truncate text-[12.5px] tabular-nums text-theme-secondary">
                {summaryText}
              </p>
              <div className="hidden max-[860px]:block">
                <SegmentedControl
                  label="Group tasks by"
                  value={grouping}
                  options={GROUPINGS}
                  onChange={switchGrouping}
                />
              </div>
            </div>
            {shownSheetId === null ? (
              <WindowControlsSlot className="absolute top-0 right-0" />
            ) : null}
          </header>
          {notice ? (
            <div
              role="alert"
              className="mx-[max(40px,calc((100%-900px)/2))] mb-1.5 flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 py-2 pr-2.5 pl-3 text-[12.5px] text-destructive max-[860px]:mx-5"
            >
              <span className="flex-1">{notice}</span>
              <button
                type="button"
                aria-label="Dismiss"
                className="size-[22px] cursor-pointer rounded-md border-0 bg-transparent text-current opacity-80 hover:bg-destructive/15 hover:opacity-100"
                onClick={() => setNotice(null)}
              >
                ✕
              </button>
            </div>
          ) : null}
          <div
            ref={scrollerRef}
            id="tasks-list"
            className="min-h-0 flex-1 overflow-y-auto px-10 pb-[72px] [scrollbar-width:thin] max-[860px]:px-5"
            onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
            onFocus={(event) => {
              const target = event.target;
              focusedRowRef.current =
                target instanceof HTMLInputElement && target.classList.contains("task-checkbox")
                  ? (target.dataset.taskId ?? null)
                  : null;
            }}
          >
            {rows.length === 0 ? (
              <div
                role="status"
                className="grid h-full place-items-center pb-20 text-center text-theme-secondary"
              >
                <div className="w-[min(360px,100%)]">
                  <span className="mb-3 inline-flex text-theme-dim" aria-hidden="true">
                    <ListTodoIcon size={22} />
                  </span>
                  <h2 className="m-0 text-[15px] font-semibold text-foreground">No tasks yet</h2>
                  <p className="mt-1.5 mb-0 text-[12.5px] leading-normal">
                    Type{" "}
                    <code className="rounded bg-theme-hover px-[5px] py-px font-mono text-[11.5px] text-foreground">
                      - []
                    </code>{" "}
                    in a note, or use the task slash command, to turn a line into a task. It shows
                    up here with its note.
                  </p>
                </div>
              </div>
            ) : groups.length === 0 ? (
              <p className="py-10 text-center text-[12.5px] text-theme-secondary">
                No tasks match “{query.trim()}”. <kbd>Esc</kbd> clears the filter.
              </p>
            ) : (
              <div className="mx-auto max-w-[900px]">
                {groups.map((group) => (
                  <TaskGroupSection
                    key={group.id}
                    group={group}
                    grouping={grouping}
                    today={today}
                    allRows={shown}
                    registry={registry}
                    selectedId={detailId}
                    selectedDay={selectedDay}
                    completedOpen={completedOpen}
                    leaving={leaving}
                    rowActions={actions.row}
                    groupActions={actions.group}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        <aside
          className="task-sheet"
          aria-label="Task details"
          data-task-sheet=""
          inert={detailId === null}
        >
          <div className="task-sheet-inner">
            {shownSheetId !== null ? (
              <TaskDetailSheet
                store={store}
                taskId={shownSheetId}
                overlay={overlay.get(shownSheetId)}
                today={today}
                hasPrevious={sheetIndex > 0}
                hasNext={sheetIndex >= 0 && sheetIndex < ids.length - 1}
                actions={actions.sheet}
              />
            ) : null}
          </div>
        </aside>
      </div>
      {popover && popoverRow ? (
        <DueDatePopover
          key={`${popover.taskId}-${popover.fromSheet}`}
          anchor={popover.anchor}
          title={popoverRow.title}
          current={popoverRow.dueDate}
          today={today}
          onClose={closePopover}
          onCommit={(dueDate) => {
            closePopover(true);
            setDue(popover.taskId, dueDate);
          }}
        />
      ) : null}
    </main>
  );
}
