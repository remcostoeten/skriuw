import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type {
  TaskPriority,
  TaskStatus,
  WorkspaceTask,
} from "@skriuw/renderer-core/contracts/workspace";
import { formatLongDate, type DateKey } from "@skriuw/renderer-core/journal/dates";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { formatDueLabel, isDueDate } from "@skriuw/renderer-core/tasks/due-dates";
import { formatRecurrenceLabel } from "@skriuw/renderer-core/tasks/recurrence";
import {
  BarChartIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  FileTextIcon,
  HashIcon,
  PlusIcon,
  RepeatIcon,
} from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { WindowControlsSlot } from "@/shared/ui/window-controls-slot";
import { Select, type SelectOption } from "@/shared/ui/select";
import { SegmentedControl, settingsPress, settingsTransition } from "@/shared/ui/settings-controls";
import type { TaskFieldPatch } from "./operations";
import type { TaskOverlay } from "@skriuw/renderer-core/tasks/rows";
import { isTypingTarget } from "./keyboard";
import { CheckMark } from "./task-row";
import {
  findCheckItem,
  recurrenceOf,
  subtasksOf,
  taskContextLines,
  type SubtaskPath,
} from "@skriuw/renderer-core/tasks/task-document";

export type TaskSheetActions = {
  close: () => void;
  returnToRow: () => void;
  navigate: (direction: "previous" | "next") => void;
  openSource: (id: string) => void;
  openDue: (id: string, anchor: HTMLElement) => void;
  setStatus: (id: string, status: TaskStatus) => void;
  setTitle: (id: string, title: string) => void;
  setFields: (id: string, patch: TaskFieldPatch) => void;
  setRecurrence: (id: string, recurrence: string | null) => void;
  toggleSubtask: (id: string, path: SubtaskPath) => void;
  addSubtask: (id: string, title: string) => void;
};

type Props = {
  store: RendererStore;
  taskId: string;
  overlay: TaskOverlay | undefined;
  today: DateKey;
  hasPrevious: boolean;
  hasNext: boolean;
  actions: TaskSheetActions;
};

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

const NO_REPEAT = "none";

const STAMP = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

const REPEAT_RULES = [
  "every day",
  "every weekday",
  "every week",
  "every 2 weeks",
  "every month",
  "every year",
] as const;

const iconButton = cn(
  "inline-grid size-7 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent text-theme-secondary hover:bg-theme-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
  settingsTransition,
  settingsPress,
);

const valueButton = cn(
  "-ml-2 inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-left text-[12.5px] text-foreground hover:bg-theme-hover",
  settingsTransition,
);

const sectionTitle =
  "m-0 mb-2 flex items-baseline justify-between gap-2.5 text-[12.5px] font-medium text-foreground";

function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-10 grid-cols-[96px_minmax(0,1fr)] items-center gap-3 border-b border-theme-divider/85 py-[5px] text-[12.5px]">
      <span className="flex items-center gap-2 text-theme-secondary">
        <span className="text-theme-dim">{icon}</span>
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function TagField({
  task,
  tags,
  onChange,
}: {
  task: WorkspaceTask;
  tags: RendererState["tags"];
  onChange: (tagIds: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const addRef = useRef<HTMLButtonElement>(null);
  const chosen = task.tagIds.filter((tagId) => tags.has(tagId));
  const needle = query.trim().replace(/^#/, "").toLocaleLowerCase();
  const suggestions = [...tags.values()]
    .filter((tag) => !task.tagIds.includes(tag.id))
    .filter((tag) => needle.length === 0 || tag.name.toLocaleLowerCase().includes(needle))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 6);

  function finish(): void {
    setAdding(false);
    setQuery("");
    window.requestAnimationFrame(() => addRef.current?.focus());
  }

  return (
    <>
      {chosen.map((tagId) => (
        <span
          key={tagId}
          className="inline-flex h-6 items-center gap-1 rounded-full bg-theme-hover pr-1 pl-2 text-xs text-reference-tag"
        >
          #{tags.get(tagId)?.name}
          <button
            type="button"
            aria-label={`Remove tag ${tags.get(tagId)?.name}`}
            className="inline-grid size-[18px] cursor-pointer place-items-center rounded-full border-0 bg-transparent text-theme-dim hover:bg-theme-active hover:text-foreground"
            onClick={() => onChange(task.tagIds.filter((id) => id !== tagId))}
          >
            <CloseIcon size={10} />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="relative">
          <input
            autoFocus
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="task-tag-suggestions"
            aria-label="Add a tag"
            placeholder="Tag name"
            value={query}
            className="h-6 w-[120px] rounded-full border border-ring/60 bg-background px-2 text-xs text-foreground outline-none"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onBlur={() => setAdding(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const first = suggestions[0];
                if (first) onChange([...task.tagIds, first.id]);
                finish();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                finish();
              }
            }}
          />
          {suggestions.length > 0 ? (
            <ul
              id="task-tag-suggestions"
              role="listbox"
              className="absolute top-7 left-0 z-10 m-0 min-w-[160px] list-none rounded-lg border border-border bg-popover p-1 shadow-[0_12px_32px_-6px_hsl(var(--scrim)/0.4)]"
            >
              {suggestions.map((tag, index) => (
                <li
                  key={tag.id}
                  role="option"
                  aria-selected={index === 0}
                  className="cursor-pointer rounded-md px-2 py-1 text-xs text-reference-tag aria-selected:bg-theme-hover hover:bg-theme-hover"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    onChange([...task.tagIds, tag.id]);
                    finish();
                  }}
                >
                  #{tag.name}
                </li>
              ))}
            </ul>
          ) : null}
        </span>
      ) : tags.size > chosen.length ? (
        <button
          ref={addRef}
          type="button"
          className="h-6 cursor-pointer rounded-full border border-dashed border-theme-btn-outline bg-transparent px-2 text-xs text-theme-dim transition-colors duration-150 hover:border-theme-dim hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          Add tag
        </button>
      ) : chosen.length === 0 ? (
        <span className="text-theme-dim">No tags in this workspace yet</span>
      ) : null}
    </>
  );
}

function SheetBody({ store, taskId, overlay, today, hasPrevious, hasNext, actions }: Props) {
  const selectTask = useCallback((state: RendererState) => state.tasks.get(taskId), [taskId]);
  const stored = useRendererSelector(store, selectTask);
  const noteId = stored?.source?.noteId ?? null;
  const selectDocument = useCallback(
    (state: RendererState) => (noteId === null ? undefined : state.documents.get(noteId)),
    [noteId],
  );
  const document = useRendererSelector(store, selectDocument);
  const selectNode = useCallback(
    (state: RendererState) => (noteId === null ? undefined : state.nodes.get(noteId)),
    [noteId],
  );
  const node = useRendererSelector(store, selectNode);
  const parentId = node?.parentId ?? null;
  const selectFolder = useCallback(
    (state: RendererState) => (parentId === null ? undefined : state.nodes.get(parentId)?.title),
    [parentId],
  );
  const folderTitle = useRendererSelector(store, selectFolder);
  const selectTags = useCallback((state: RendererState) => state.tags, []);
  const tags = useRendererSelector(store, selectTags);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [subtaskDraft, setSubtaskDraft] = useState("");

  if (!stored) {
    return (
      <p className="px-6 py-4 text-[12.5px] text-theme-secondary">This task no longer exists.</p>
    );
  }
  const task: WorkspaceTask = {
    ...stored,
    status: overlay?.status ?? stored.status,
    dueDate: overlay?.dueDate === undefined ? stored.dueDate : overlay.dueDate,
    title: overlay?.title ?? stored.title,
  };
  const done = task.status === "done";
  const linked = task.source !== null && node !== undefined;
  const item =
    linked && document && task.source
      ? findCheckItem(document.documentJson, task.source.blockId)
      : null;
  const subtasks = item ? subtasksOf(item) : [];
  const recurrence = item ? recurrenceOf(item) : null;
  const context = linked && document ? taskContextLines(document.markdown, task.id) : [];
  const line = context.find((entry) => entry.current)?.number ?? null;
  const dueDate = isDueDate(task.dueDate) ? task.dueDate : null;
  const late = dueDate !== null && !done && dueDate < today;
  const subtasksDone = subtasks.filter((subtask) => subtask.done).length;
  const repeatOptions: SelectOption<string>[] = [
    { value: NO_REPEAT, label: "Does not repeat" },
    ...REPEAT_RULES.map((rule) => ({ value: rule, label: formatRecurrenceLabel(rule) })),
    ...(recurrence !== null && !REPEAT_RULES.some((rule) => rule === recurrence)
      ? [{ value: recurrence, label: formatRecurrenceLabel(recurrence) }]
      : []),
  ];

  function commitTitle(): void {
    const value = titleRef.current?.value.replace(/\s+/g, " ").trim() ?? "";
    if (value.length === 0) {
      if (titleRef.current) titleRef.current.value = task.title;
      return;
    }
    if (value !== task.title) actions.setTitle(task.id, value);
  }

  function onTitleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      actions.returnToRow();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.value = task.title;
      event.currentTarget.blur();
      actions.returnToRow();
    }
  }

  function fitTitle(element: HTMLTextAreaElement | null): void {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }

  const crumb =
    task.source === null
      ? task.detachedAt === null
        ? "Not in a note"
        : "Detached"
      : linked
        ? null
        : "Its note was deleted";

  return (
    <>
      <div className="flex h-[52px] flex-none items-center gap-1 pr-3 pl-6">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-theme-dim">
          {crumb !== null ? (
            <b className="font-[450] text-theme-secondary">{crumb}</b>
          ) : (
            <>
              {folderTitle ? (
                <>
                  <span className="truncate">{folderTitle}</span>
                  <span aria-hidden="true">/</span>
                </>
              ) : null}
              <b className="truncate font-[450] text-theme-secondary">
                {node?.title || "Untitled"}
              </b>
            </>
          )}
        </div>
        <button
          type="button"
          className={iconButton}
          aria-label="Previous task"
          disabled={!hasPrevious}
          onClick={() => actions.navigate("previous")}
        >
          <ChevronDownIcon size={15} className="rotate-180" />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label="Next task"
          disabled={!hasNext}
          onClick={() => actions.navigate("next")}
        >
          <ChevronDownIcon size={15} />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label="Close details"
          onClick={actions.close}
        >
          <CloseIcon size={14} />
        </button>
        <WindowControlsSlot className="-mr-3 ml-1" />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-6 pt-0.5 pb-10 [scrollbar-width:thin]"
        onKeyDown={(event) => {
          if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey)
            return;
          if (event.key === "d" || event.key === "D") {
            const anchor = event.currentTarget.querySelector<HTMLElement>("[data-sheet-due]");
            if (anchor) {
              event.preventDefault();
              actions.openDue(task.id, anchor);
            }
          } else if ((event.key === "o" || event.key === "O") && linked) {
            event.preventDefault();
            actions.openSource(task.id);
          }
        }}
      >
        <div
          className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-3 pt-1.5 pb-4"
          data-done={done}
        >
          <input
            id="task-sheet-done"
            type="checkbox"
            className="task-checkbox"
            checked={done}
            aria-label="Done"
            onChange={() => actions.setStatus(task.id, done ? "todo" : "done")}
          />
          <label htmlFor="task-sheet-done" className="task-check mt-[5px]" aria-hidden="true">
            <CheckMark />
          </label>
          <textarea
            ref={(element) => {
              titleRef.current = element;
              fitTitle(element);
            }}
            data-sheet-title=""
            rows={1}
            defaultValue={task.title}
            aria-label="Task title"
            spellCheck={false}
            className={cn(
              "-mx-1.5 resize-none overflow-hidden rounded-md border-0 bg-transparent px-1.5 py-px text-lg leading-[1.35] font-[550] tracking-[-0.012em] text-foreground outline-none [overflow-wrap:anywhere] hover:bg-theme-hover/55 focus:bg-theme-hover/55 focus:shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.55)]",
              settingsTransition,
              done && "text-theme-dim line-through decoration-1",
            )}
            onInput={(event) => fitTitle(event.currentTarget)}
            onBlur={commitTitle}
            onKeyDown={onTitleKeyDown}
          />
        </div>
        <div className="border-t border-theme-divider/85">
          <PropertyRow icon={<ClockIcon size={13} />} label="Status">
            <SegmentedControl
              label="Status"
              value={task.status}
              options={STATUS_OPTIONS}
              onChange={(status) => actions.setStatus(task.id, status)}
            />
          </PropertyRow>
          <PropertyRow icon={<CalendarIcon size={13} />} label="Due">
            <button
              type="button"
              data-sheet-due=""
              className={cn(
                valueButton,
                dueDate === null && "text-theme-dim",
                late && "text-destructive",
              )}
              onClick={(event) => actions.openDue(task.id, event.currentTarget)}
            >
              {dueDate === null ? (
                "Add date"
              ) : (
                <>
                  {formatLongDate(dueDate)}
                  <small className="text-[11.5px] text-theme-dim">
                    {formatDueLabel(dueDate, today)}
                  </small>
                </>
              )}
            </button>
          </PropertyRow>
          {item !== null ? (
            <PropertyRow icon={<RepeatIcon size={13} />} label="Repeat">
              <Select
                label="Repeat"
                value={recurrence ?? NO_REPEAT}
                options={repeatOptions}
                onChange={(value) =>
                  actions.setRecurrence(task.id, value === NO_REPEAT ? null : value)
                }
              />
            </PropertyRow>
          ) : null}
          <PropertyRow icon={<BarChartIcon size={13} />} label="Priority">
            <SegmentedControl<TaskPriority>
              label="Priority"
              value={task.priority}
              options={PRIORITY_OPTIONS}
              onChange={(priority) => actions.setFields(task.id, { priority })}
            />
          </PropertyRow>
          <PropertyRow icon={<HashIcon size={13} />} label="Tags">
            <TagField
              task={task}
              tags={tags}
              onChange={(tagIds) => actions.setFields(task.id, { tagIds })}
            />
          </PropertyRow>
          <PropertyRow icon={<FileTextIcon size={13} />} label="Note">
            {linked ? (
              <button
                type="button"
                className={valueButton}
                onClick={() => actions.openSource(task.id)}
              >
                <span className="truncate">{node?.title || "Untitled"}</span>
                {line !== null ? (
                  <small className="text-[11.5px] text-theme-dim">line {line}</small>
                ) : null}
              </button>
            ) : (
              <span className="text-theme-dim">{crumb}</span>
            )}
          </PropertyRow>
        </div>

        <section className="mt-6">
          <h3 className={sectionTitle}>
            Notes
            <small className="text-[11.5px] font-normal text-theme-dim">
              Kept on the task, not in the note
            </small>
          </h3>
          <textarea
            defaultValue={task.description}
            placeholder="Add notes"
            aria-label="Task notes"
            className="-mx-2.5 block min-h-[76px] w-[calc(100%+20px)] resize-y rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-[13px] leading-[1.55] text-foreground outline-none transition-[border-color,background-color] duration-150 placeholder:text-theme-dim hover:border-theme-divider/85 focus:border-ring/60 focus:bg-background"
            onBlur={(event) => {
              const value = event.currentTarget.value;
              if (value !== task.description) actions.setFields(task.id, { description: value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.blur();
                actions.returnToRow();
              }
            }}
          />
        </section>

        {item !== null ? (
          <section className="mt-6">
            <h3 className={sectionTitle}>
              Subtasks
              {subtasks.length > 0 ? (
                <small className="text-[11.5px] font-normal tabular-nums text-theme-dim">
                  {subtasksDone} of {subtasks.length}
                </small>
              ) : null}
            </h3>
            <ul className="m-0 list-none p-0">
              {subtasks.map((subtask) => {
                const id = `task-subtask-${subtask.path.list}-${subtask.path.item}`;
                return (
                  <li
                    key={id}
                    data-done={subtask.done}
                    className="relative grid grid-cols-[14px_minmax(0,1fr)] items-start gap-2.5 border-b border-theme-divider/85 py-[7px] text-[13px]"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="task-checkbox size-3.5!"
                      checked={subtask.done}
                      aria-label={subtask.title || "Untitled subtask"}
                      onChange={() => actions.toggleSubtask(task.id, subtask.path)}
                    />
                    <label
                      htmlFor={id}
                      className="task-check mt-0.5 size-3.5! rounded-[4px]!"
                      aria-hidden="true"
                    >
                      <CheckMark />
                    </label>
                    <span
                      className={cn(subtask.done && "text-theme-dim line-through decoration-1")}
                    >
                      {subtask.title || "Untitled"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <label className="flex items-center gap-2.5 py-1.5 text-theme-dim">
              <PlusIcon size={14} className="flex-none" />
              <input
                type="text"
                value={subtaskDraft}
                placeholder="Add a subtask"
                aria-label="Add a subtask"
                spellCheck={false}
                className="h-[26px] min-w-0 flex-1 border-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-theme-dim"
                onChange={(event) => setSubtaskDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && subtaskDraft.trim().length > 0) {
                    event.preventDefault();
                    actions.addSubtask(task.id, subtaskDraft);
                    setSubtaskDraft("");
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setSubtaskDraft("");
                    event.currentTarget.blur();
                    actions.returnToRow();
                  }
                }}
              />
            </label>
          </section>
        ) : null}

        <section className="mt-6">
          <h3 className={sectionTitle}>
            In the note
            {linked ? (
              <button
                type="button"
                className="cursor-pointer rounded-[5px] border-0 bg-transparent px-1 py-px text-[11.5px] font-normal text-theme-secondary transition-colors duration-150 hover:bg-theme-hover/55 hover:text-foreground"
                onClick={() => actions.openSource(task.id)}
              >
                Open note
              </button>
            ) : null}
          </h3>
          {context.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-theme-divider/85 bg-theme-deep py-2 text-[12.5px] leading-[1.65]">
              {context.map((entry) => (
                <div
                  key={entry.number}
                  className={cn(
                    "relative grid grid-cols-[30px_minmax(0,1fr)] pr-3 whitespace-pre-wrap text-theme-secondary [overflow-wrap:anywhere]",
                    entry.heading && "font-[550] text-foreground",
                    entry.current && "bg-accent-ink/10 text-foreground",
                  )}
                >
                  <i className="pr-2.5 text-right font-mono text-[10.5px] leading-[2.05] not-italic text-theme-dim">
                    {entry.number}
                  </i>
                  {entry.text}
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[12.5px] text-theme-secondary">
              {linked
                ? "The note does not carry this task's line right now."
                : "This task has no line in a note. It keeps its text until you complete it."}
            </p>
          )}
        </section>

        <p className="mt-6 mb-0 text-[11.5px] tabular-nums text-theme-dim">
          Created {STAMP.format(task.createdAt)} · Changed {STAMP.format(task.updatedAt)}
        </p>
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 border-t border-theme-divider/85 px-6 pt-2.5 pb-3 text-[10.5px] text-theme-dim"
        aria-hidden="true"
      >
        <span>
          <kbd>Esc</kbd> Close
        </span>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> Next task
        </span>
        <span>
          <kbd>D</kbd> Date
        </span>
        {linked ? (
          <span>
            <kbd>O</kbd> Open note
          </span>
        ) : null}
      </div>
    </>
  );
}

export function TaskDetailSheet(props: Props) {
  return <SheetBody key={props.taskId} {...props} />;
}
