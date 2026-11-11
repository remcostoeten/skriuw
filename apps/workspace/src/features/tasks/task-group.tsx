import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { formatLongDate, parseDateKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import { formatDueLabel } from "@skriuw/renderer-core/tasks/due-dates";
import { cn } from "@/shared/styling/class-names";
import { settingsPress, settingsTransition } from "@/shared/ui/settings-controls";
import type { LedgerRegistry } from "@/shared/ui/settings-ledger";
import {
  COMPLETED_PREVIEW,
  oldestLateness,
  upcomingWeek,
  type TaskGroup,
  type TaskGrouping,
  type TaskRow,
} from "@skriuw/renderer-core/tasks/rows";
import { TaskListItem, type TaskRowActions } from "./task-row";

export type TaskGroupActions = {
  moveOverdueToToday: () => void;
  toggleCompleted: () => void;
  selectDay: (dueDate: DateKey) => void;
  openNote: (noteId: string) => void;
};

type Props = {
  group: TaskGroup;
  grouping: TaskGrouping;
  today: DateKey;
  allRows: readonly TaskRow[];
  registry: LedgerRegistry;
  selectedId: string | null;
  selectedDay: DateKey | null;
  completedOpen: boolean;
  leaving: ReadonlySet<string>;
  rowActions: TaskRowActions;
  groupActions: TaskGroupActions;
};

const WEEKDAY = new Intl.DateTimeFormat("en", { weekday: "short" });

const actionClass = cn(
  "-ml-[9px] mt-2.5 inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-[9px] text-xs text-theme-secondary hover:bg-theme-hover hover:text-foreground",
  settingsTransition,
  settingsPress,
);

export function groupDomId(groupId: string): string {
  return `tasks-group-${groupId}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function Heading({ group, count }: { group: TaskGroup; count: number }) {
  return (
    <h2
      id={`${groupDomId(group.id)}-title`}
      className="m-0 flex items-baseline gap-[7px] text-[13px] font-medium tracking-[-0.005em] text-foreground"
    >
      {group.kind === "overdue" ? (
        <span aria-hidden="true" className="size-1.5 self-center rounded-full bg-destructive" />
      ) : null}
      <span className="min-w-0 [overflow-wrap:anywhere]">{group.title}</span>
      <span className="text-[10.5px] font-normal tabular-nums text-theme-dim">{count}</span>
    </h2>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 mb-0 text-xs leading-[1.45] text-theme-secondary">{children}</p>;
}

function Margin({
  group,
  grouping,
  today,
  allRows,
  selectedDay,
  completedOpen,
  groupActions,
}: Omit<Props, "registry" | "selectedId" | "leaving" | "rowActions">) {
  const count = group.rows.length;
  if (group.kind === "overdue") {
    const oldest = oldestLateness(group.rows, today);
    return (
      <>
        <Heading group={group} count={count} />
        <Hint>Oldest is {plural(oldest, "day")} late.</Hint>
        <button
          type="button"
          className={cn(actionClass, "max-[860px]:hidden")}
          onClick={groupActions.moveOverdueToToday}
        >
          Move all to today
        </button>
      </>
    );
  }
  if (group.kind === "today") {
    const done = group.rows.filter((row) => row.done).length;
    return (
      <>
        <Heading group={group} count={count} />
        <Hint>{formatLongDate(today)}</Hint>
        <div
          role="img"
          aria-label={`${done} of ${count} done today`}
          className="mt-3 max-w-[150px] max-[860px]:hidden"
        >
          <i className="block h-1 overflow-hidden rounded bg-theme-hover">
            <b
              className="task-meter-bar block h-full w-full rounded bg-accent-ink"
              style={{ transform: `scaleX(${count === 0 ? 0 : done / count})` }}
            />
          </i>
          <small className="mt-1.5 block text-[11px] tabular-nums text-theme-dim">
            {done} of {count} done
          </small>
        </div>
      </>
    );
  }
  if (group.kind === "upcoming") {
    const week = upcomingWeek(allRows, today);
    const thisWeek = week.reduce((total, day) => total + day.count, 0);
    return (
      <>
        <Heading group={group} count={count} />
        <Hint>
          {thisWeek === 0
            ? "Nothing in the next seven days."
            : `${thisWeek} in the next seven days.`}
        </Hint>
        <div className="mt-3 grid max-w-[168px] grid-cols-7 gap-0.5 max-[860px]:hidden">
          {week.map((day) => {
            const date = parseDateKey(day.dueDate);
            return (
              <button
                key={day.dueDate}
                type="button"
                aria-pressed={selectedDay === day.dueDate}
                aria-label={`${formatLongDate(day.dueDate)}, ${plural(day.count, "task")}`}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-0.5 rounded-md border-0 bg-transparent px-0 pt-1 pb-[5px] text-[10px] text-theme-dim hover:bg-theme-hover/55 aria-pressed:bg-theme-hover aria-pressed:text-foreground",
                  settingsTransition,
                )}
                onClick={() => groupActions.selectDay(day.dueDate)}
              >
                {WEEKDAY.format(date).slice(0, 2)}
                <b
                  className={cn(
                    "text-[11.5px] font-medium tabular-nums",
                    selectedDay === day.dueDate ? "text-foreground" : "text-theme-secondary",
                  )}
                >
                  {date.getDate()}
                </b>
                <span className="flex h-1 gap-0.5" aria-hidden="true">
                  {Array.from({ length: Math.min(3, day.count) }, (_, index) => (
                    <i key={index} className="size-1 rounded-full bg-accent-ink" />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  }
  if (group.kind === "none") {
    return (
      <>
        <Heading group={group} count={count} />
        <Hint>
          Press <kbd>D</kbd> on a task to give it one.
        </Hint>
      </>
    );
  }
  if (group.kind === "completed") {
    return (
      <>
        <Heading group={group} count={count} />
        <Hint>Most recently changed first.</Hint>
        {count > COMPLETED_PREVIEW ? (
          <button
            type="button"
            className={actionClass}
            aria-expanded={completedOpen}
            onClick={groupActions.toggleCompleted}
          >
            {completedOpen ? "Show fewer" : `Show all ${count}`}
          </button>
        ) : null}
      </>
    );
  }
  if (group.kind === "detached") {
    return (
      <>
        <Heading group={group} count={count} />
        <Hint>Their lines are no longer in a note. They stay here until you complete them.</Hint>
      </>
    );
  }
  const late = group.rows.filter(
    (row) => !row.done && row.dueDate !== null && row.dueDate < today,
  ).length;
  const next = group.rows.find((row) => !row.done && row.dueDate !== null && row.dueDate >= today);
  const status =
    late > 0
      ? `${late} overdue`
      : next?.dueDate
        ? `Next ${formatDueLabel(next.dueDate, today).replace(/^(Today|Tomorrow)$/, (word) => word.toLowerCase())}`
        : "No dates";
  return (
    <>
      <Heading group={group} count={count} />
      <Hint>{group.folderTitle ? `${group.folderTitle} · ${status}` : status}</Hint>
      {group.noteId !== null && grouping === "note" ? (
        <button
          type="button"
          className={cn(actionClass, "max-[860px]:hidden")}
          onClick={() => {
            if (group.noteId !== null) groupActions.openNote(group.noteId);
          }}
        >
          Open note
        </button>
      ) : null}
    </>
  );
}

export function TaskGroupSection(props: Props) {
  const {
    group,
    grouping,
    today,
    registry,
    selectedId,
    selectedDay,
    completedOpen,
    leaving,
    rowActions,
  } = props;
  const ref = useRef<HTMLElement>(null);
  const count = group.rows.length;
  const alert = group.kind === "overdue";

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    return registry.register({ id: group.id, title: group.title, element, count, alert });
  }, [registry, group.id, group.title, count, alert]);

  const showSource = grouping === "due" || group.kind === "completed";
  function renderRows(rows: readonly TaskRow[], label: string, className?: string) {
    return (
      <ul className={cn("m-0 min-w-0 list-none p-0", className)} aria-label={label}>
        {rows.map((row) => (
          <TaskListItem
            key={row.id}
            row={row}
            today={today}
            showSource={showSource}
            selected={row.id === selectedId}
            lit={selectedDay !== null && !row.done && row.dueDate === selectedDay}
            leaving={leaving.has(row.id)}
            actions={rowActions}
          />
        ))}
      </ul>
    );
  }
  const folded = group.kind === "completed" && count > COMPLETED_PREVIEW;

  return (
    <section
      ref={ref}
      id={groupDomId(group.id)}
      data-task-group={group.id}
      aria-labelledby={`${groupDomId(group.id)}-title`}
      className="grid scroll-mt-1 grid-cols-[168px_minmax(0,1fr)] gap-x-7 border-t border-theme-divider/85 pt-[22px] pb-2 first:border-t-0 first:pt-3 max-[860px]:grid-cols-1"
    >
      <div className="sticky top-3.5 min-w-0 self-start max-[860px]:static max-[860px]:mb-1.5">
        <Margin {...props} />
      </div>
      <div className="min-w-0">
        {folded ? (
          <>
            {renderRows(group.rows.slice(0, COMPLETED_PREVIEW), group.title)}
            {completedOpen
              ? renderRows(
                  group.rows.slice(COMPLETED_PREVIEW),
                  "Older completed tasks",
                  "task-fold",
                )
              : null}
          </>
        ) : (
          renderRows(group.rows, group.title)
        )}
      </div>
    </section>
  );
}
