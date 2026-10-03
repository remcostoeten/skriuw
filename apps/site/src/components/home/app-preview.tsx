"use client";

import { useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode, SVGProps } from "react";
import { cn } from "@skriuw/shared/helpers/cn";
import {
  centerOf,
  idleCursor,
  jitter,
  sleep,
  useAutopilot,
  useInView,
  usePauseOnInteraction,
  useReducedMotion,
} from "@/components/home/app-preview-autopilot";
import type { CursorState } from "@/components/home/app-preview-autopilot";
import {
  calendar,
  draftSentence,
  emptyEntry,
  initialTasks,
  journalEntries,
  moodLabels,
  moodTone,
  moods,
  notes,
  notesById,
  people,
  railViews,
  revisions,
  savedRevision,
  tags,
  today,
  tree,
  viewLabels,
  weekdays,
  welcome,
} from "@/components/home/app-preview-data";
import type {
  Block,
  Entity,
  JournalEntry,
  Mood,
  Note,
  OutlineItem,
  Revision,
  Task,
  View,
} from "@/components/home/app-preview-data";
import {
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Fold,
  FolderOpen,
  FolderPlus,
  Gear,
  ListTodo,
  NotePlus,
  PanelLeft,
  PanelRight,
  Search,
  Tag,
  Trash,
  Users,
} from "@/components/ui/icons";
import { WordmarkGlyph } from "@/components/ui/primitives";
import { roundedPath } from "@/components/ui/geometry";
import type { Point } from "@/components/ui/geometry";

const viewIcons: Record<View, (props: SVGProps<SVGSVGElement>) => ReactNode> = {
  notes: FolderOpen,
  journal: CalendarRange,
  tasks: ListTodo,
  tags: Tag,
  people: Users,
};

const railPitch = 44;
const treeRowHeight = 28;

const focusRing = "outline-none focus-visible:ring-1 focus-visible:ring-accent";

const iconButton = cn(
  "grid size-7 shrink-0 place-items-center rounded-md text-ink-400 transition-colors duration-150 hover:bg-ink-900/6 hover:text-ink-900",
  focusRing,
);

function demoDelay(index: number): CSSProperties {
  return { "--demo-delay": `${index * 45}ms` } as CSSProperties;
}

function viewHasSidebar(view: View) {
  return view === "notes" || view === "journal";
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function outlineOf(blocks: Block[]): OutlineItem[] {
  return blocks.filter((block): block is OutlineItem => block.kind === "heading");
}

function paletteResults(query: string) {
  const needle = query.trim().toLowerCase();
  return notes.filter((note) => !needle || note.label.toLowerCase().includes(needle)).slice(0, 5);
}

function Rail({ view, onSelect }: { view: View; onSelect: (view: View) => void }) {
  const index = railViews.indexOf(view);
  return (
    <nav
      aria-label="Preview views"
      className="hidden w-12 shrink-0 flex-col items-center justify-between border-r border-line bg-ink-50 @min-[600px]:flex"
    >
      <div className="flex w-full flex-col items-center">
        <div className="flex h-10 w-full items-center justify-center border-b border-line">
          <WordmarkGlyph className="size-[18px] text-ink-900" />
        </div>
        <div className="relative mt-3 flex flex-col items-center gap-3">
          <span
            aria-hidden
            className="absolute top-0 left-0 size-8 rounded-lg bg-ink-900/8 transition-transform duration-250 ease-[var(--ease-in-out)] motion-reduce:transition-none"
            style={{ transform: `translateY(${index * railPitch}px)` }}
          />
          {railViews.map((target) => {
            const Icon = viewIcons[target];
            const active = view === target;
            return (
              <button
                key={target}
                type="button"
                title={viewLabels[target]}
                aria-label={viewLabels[target]}
                aria-current={active ? "page" : undefined}
                data-demo={`rail-${target}`}
                onClick={() => onSelect(target)}
                className={cn(
                  "relative grid size-8 place-items-center rounded-lg transition-[color,transform] duration-150 active:scale-[0.94]",
                  focusRing,
                  active ? "text-ink-900" : "text-ink-400 hover:text-ink-700",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col items-center gap-2.5 pb-3 text-ink-400">
        <Trash className="size-4" />
        <span aria-hidden className="h-px w-6 bg-line" />
        <span className="grid size-6 place-items-center rounded-full border border-line bg-surface">
          <Gear className="size-3.5" />
        </span>
      </div>
    </nav>
  );
}

function TabBar({ view, onSelect }: { view: View; onSelect: (view: View) => void }) {
  return (
    <nav
      aria-label="Preview views"
      className="flex h-12 shrink-0 items-stretch border-t border-line bg-ink-50 @min-[600px]:hidden"
    >
      {railViews.map((target) => {
        const Icon = viewIcons[target];
        const active = view === target;
        return (
          <button
            key={target}
            type="button"
            aria-label={viewLabels[target]}
            aria-current={active ? "page" : undefined}
            data-demo={`rail-${target}`}
            onClick={() => onSelect(target)}
            className={cn(
              "flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-[3px] transition-colors duration-150",
              focusRing,
              active ? "text-ink-900" : "text-ink-400",
            )}
          >
            <Icon className="size-4" />
            <span className="max-w-full truncate text-[9px] leading-none font-medium">
              {viewLabels[target]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function NoteTree({
  activeId,
  highlight,
  onSelect,
}: {
  activeId: string;
  highlight: boolean;
  onSelect: (id: string) => void;
}) {
  const activeRow = tree.findIndex((row) => row.kind === "note" && row.id === activeId);
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden px-1.5 py-1.5">
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-1.5 top-1.5 rounded-md bg-ink-900/8 transition-[transform,opacity] duration-250 ease-[var(--ease-in-out)] motion-reduce:transition-none",
          highlight ? "opacity-100" : "opacity-0",
        )}
        style={{
          height: treeRowHeight,
          transform: `translateY(${Math.max(0, activeRow) * treeRowHeight}px)`,
        }}
      />
      {tree.map((row) => {
        if (row.kind === "folder") {
          return (
            <div
              key={row.label}
              style={{ height: treeRowHeight }}
              className="relative flex items-center gap-1.5 px-2 text-[12px] font-medium text-ink-700"
            >
              <FolderOpen className="size-3.5 shrink-0 text-ink-400" />
              <span className="truncate">{row.label}</span>
              <span className="ml-auto font-mono text-[10px] text-ink-400 tabular-nums">
                {row.count}
              </span>
            </div>
          );
        }
        const note = notesById.get(row.id);
        if (!note) return null;
        const active = highlight && row.id === activeId;
        return (
          <button
            key={row.id}
            type="button"
            aria-current={active ? "page" : undefined}
            data-demo={`note-${row.id}`}
            onClick={() => onSelect(row.id)}
            style={{ height: treeRowHeight, paddingLeft: 8 + row.depth * 16 }}
            className={cn(
              "relative flex w-full items-center rounded-md pr-2 text-left text-[12px] transition-colors duration-150",
              focusRing,
              active ? "font-medium text-ink-900" : "text-ink-500 hover:text-ink-900",
            )}
          >
            <span className="truncate">{note.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MiniCalendar({
  selected,
  interactive,
  onSelect,
}: {
  selected: number;
  interactive: boolean;
  onSelect: (date: number) => void;
}) {
  return (
    <div className="border-t border-line px-2.5 pt-2.5 pb-2">
      <div className="flex items-center gap-1 text-ink-400">
        <ChevronLeft className="size-3" />
        <ChevronRight className="size-3" />
        <span className="ml-1.5 text-[11px] font-medium text-ink-700">October 2026</span>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-y-0.5 text-center font-mono text-[9px] text-ink-400">
        {weekdays.map((day) => (
          <span key={day} className="pb-0.5">
            {day}
          </span>
        ))}
        {calendar.map((cell, index) => {
          const hasEntry = !cell.muted && cell.date in journalEntries;
          const isSelected = interactive && !cell.muted && cell.date === selected;
          return (
            <button
              key={index}
              type="button"
              tabIndex={!cell.muted ? 0 : -1}
              disabled={cell.muted}
              data-demo={cell.muted ? undefined : `day-${cell.date}`}
              onClick={() => onSelect(cell.date)}
              className={cn(
                "relative mx-auto grid size-[18px] place-items-center rounded tabular-nums transition-colors duration-150",
                focusRing,
                cell.muted ? "text-ink-300" : "hover:bg-ink-900/6",
                !cell.muted && cell.date === today && "font-semibold text-ink-900",
                isSelected && "bg-ink-900 text-surface hover:bg-ink-900",
              )}
            >
              {cell.date}
              {hasEntry && !isSelected ? (
                <span
                  aria-hidden
                  className="absolute bottom-px left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-accent"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Sidebar({
  view,
  activeId,
  day,
  onOpenNote,
  onOpenDay,
  onOpenPalette,
}: {
  view: View;
  activeId: string;
  day: number;
  onOpenNote: (id: string) => void;
  onOpenDay: (date: number) => void;
  onOpenPalette: () => void;
}) {
  return (
    <aside
      className={cn(
        "w-[188px] shrink-0 flex-col border-r border-line bg-ink-50",
        viewHasSidebar(view) ? "hidden @min-[600px]:flex" : "hidden",
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-2">
        <span className={iconButton}>
          <NotePlus className="size-3.5" />
        </span>
        <span className={iconButton}>
          <FolderPlus className="size-3.5" />
        </span>
        <span className={iconButton}>
          <Fold className="size-3.5" />
        </span>
        <button
          type="button"
          aria-label="Search notes"
          data-demo="search"
          onClick={onOpenPalette}
          className={iconButton}
        >
          <Search className="size-3.5" />
        </button>
        <span className={iconButton}>
          <ListTodo className="size-3.5" />
        </span>
      </div>
      <NoteTree activeId={activeId} highlight={view === "notes"} onSelect={onOpenNote} />
      <MiniCalendar selected={day} interactive={view === "journal"} onSelect={onOpenDay} />
    </aside>
  );
}

function TopBar({ title, onOpenPalette }: { title: string; onOpenPalette: () => void }) {
  return (
    <div className="grid h-10 shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-center border-b border-line bg-ink-50 px-1.5">
      <div className="flex items-center gap-0.5">
        <span className={iconButton}>
          <PanelLeft className="size-3.5" />
        </span>
        <span className={cn(iconButton, "hidden @min-[600px]:grid")}>
          <ChevronLeft className="size-3.5" />
        </span>
        <span className={cn(iconButton, "hidden @min-[600px]:grid")}>
          <ChevronRight className="size-3.5" />
        </span>
      </div>
      <p key={title} className="hy-demo-fade truncate px-2 text-center text-[12.5px] text-ink-900">
        {title}
      </p>
      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          aria-label="Search"
          data-demo="search"
          onClick={onOpenPalette}
          className={iconButton}
        >
          <Search className="size-3.5" />
        </button>
        <span className={iconButton}>
          <PanelRight className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

function BlockView({ block, index }: { block: Block; index: number }) {
  if (block.kind === "heading") {
    return (
      <p
        style={demoDelay(index)}
        className={cn(
          "hy-demo-line font-semibold tracking-[-0.01em] text-ink-900",
          block.level === 1 && "text-[24px] leading-[1.15] tracking-[-0.02em]",
          block.level === 2 && "pt-2 text-[16px] leading-snug",
          block.level === 3 && "pt-1 text-[14px] leading-snug",
        )}
      >
        {block.text}
      </p>
    );
  }
  if (block.kind === "item") {
    return (
      <p style={demoDelay(index)} className="hy-demo-line flex items-center gap-2 text-ink-700">
        <span
          aria-hidden
          className={cn(
            "grid size-3.5 shrink-0 place-items-center rounded-[4px] border",
            block.done ? "border-ink-900 bg-ink-900 text-surface" : "border-ink-400",
          )}
        >
          {block.done ? <Check className="size-2.5" /> : null}
        </span>
        <span className={cn(block.done && "text-ink-400 line-through")}>{block.text}</span>
      </p>
    );
  }
  return (
    <p style={demoDelay(index)} className="hy-demo-line text-ink-700">
      {block.text}
    </p>
  );
}

function Document({ id, blocks, draft }: { id: string; blocks: Block[]; draft?: string }) {
  return (
    <article key={id} className="mt-5 space-y-2 text-[13px] leading-[1.65]">
      {blocks.map((block, index) => (
        <BlockView key={`${block.kind}-${index}`} block={block} index={index} />
      ))}
      {draft !== undefined ? (
        <p className="text-ink-700">
          {draft}
          <span
            aria-hidden
            className="hy-demo-caret ml-px inline-block h-3.5 w-px translate-y-0.5 bg-ink-900"
          />
        </p>
      ) : null}
    </article>
  );
}

function NotePane({ note, draft }: { note: Note; draft?: string }) {
  return (
    <div className="mx-auto w-full max-w-[600px] px-5 py-5 @min-[600px]:px-8">
      <div className="flex items-center justify-between text-[11px] text-ink-400">
        <span className="flex items-center gap-1">
          <ChevronRight className="size-3" />
          Properties <span className="text-ink-300">(0)</span>
        </span>
        <span className="caps text-[0.6rem]">add cover</span>
      </div>
      <Document id={note.id} blocks={note.blocks} draft={draft} />
    </div>
  );
}

function JournalPane({
  date,
  entry,
  onMood,
  onStep,
}: {
  date: number;
  entry: JournalEntry;
  onMood: (mood: Mood) => void;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[600px] px-5 py-5 @min-[600px]:px-8">
      <div className="flex items-center justify-between gap-3 text-[11px] text-ink-400">
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous day"
            data-demo="day-prev"
            disabled={date <= 1}
            onClick={() => onStep(-1)}
            className={cn(iconButton, "size-6 disabled:opacity-40")}
          >
            <ChevronLeft className="size-3" />
          </button>
          <button
            type="button"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => onStep(1)}
            className={cn(iconButton, "size-6 disabled:opacity-40")}
          >
            <ChevronRight className="size-3" />
          </button>
        </span>
        <span className="flex items-center gap-1">
          {moods.map((mood) => (
            <button
              key={mood}
              type="button"
              aria-label={`Mood: ${moodLabels[mood]}`}
              aria-pressed={entry.mood === mood}
              data-demo={`mood-${mood}`}
              onClick={() => onMood(mood)}
              className={cn(
                "grid size-6 place-items-center rounded-md transition-colors duration-150 hover:bg-ink-900/6",
                focusRing,
                entry.mood === mood && "bg-ink-900/8",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full transition-[transform,opacity] duration-200 ease-[var(--ease-out)]",
                  moodTone[mood],
                  entry.mood === mood ? "scale-125 opacity-100" : "opacity-40",
                )}
              />
            </button>
          ))}
        </span>
      </div>
      <Document id={`journal-${date}`} blocks={entry.blocks} />
    </div>
  );
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={task.done}
      data-demo={`task-${task.id}`}
      onClick={() => onToggle(task.id)}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors duration-150 hover:bg-ink-900/5",
        focusRing,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors duration-150",
          task.done ? "border-ink-900 bg-ink-900 text-surface" : "border-ink-400",
        )}
      >
        <Check
          className={cn(
            "size-2.5 transition-[transform,opacity] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none",
            task.done ? "scale-100 opacity-100" : "scale-[0.6] opacity-0",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate transition-colors duration-150",
            task.done ? "text-ink-400 line-through" : "text-ink-900",
          )}
        >
          {task.text}
        </span>
        <span className="block truncate text-[11px] text-ink-400">{task.note}</span>
      </span>
      <span className="caps shrink-0 text-[0.58rem] text-ink-400">{task.due}</span>
    </button>
  );
}

function TasksPane({ tasks, onToggle }: { tasks: Task[]; onToggle: (id: string) => void }) {
  const groups = [
    { label: "Today", items: tasks.filter((task) => task.due === "Today") },
    { label: "Upcoming", items: tasks.filter((task) => task.due !== "Today") },
  ];
  const open = tasks.filter((task) => !task.done).length;
  let row = 0;
  return (
    <div className="mx-auto w-full max-w-[600px] px-3 py-5 @min-[600px]:px-6">
      <p className="px-2 text-[11px] text-ink-400 tabular-nums">{open} open across 2 notes</p>
      {groups.map((group) => (
        <section key={group.label} className="mt-3">
          <p className="caps px-2 pb-1 text-[0.6rem] text-ink-400">{group.label}</p>
          <ul className="m-0 list-none p-0">
            {group.items.map((task) => {
              row += 1;
              return (
                <li key={task.id} className="hy-demo-line" style={demoDelay(row)}>
                  <TaskRow task={task} onToggle={onToggle} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EntityPane({
  kind,
  entities,
  selected,
  onSelect,
}: {
  kind: "tags" | "people";
  entities: Entity[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const entity = entities[selected] ?? entities[0];
  return (
    <div className="flex h-full min-h-0">
      <ul className="m-0 w-[42%] max-w-[220px] shrink-0 list-none border-r border-line p-1.5">
        {entities.map((item, index) => (
          <li key={item.name} className="hy-demo-line" style={demoDelay(index)}>
            <button
              type="button"
              aria-current={index === selected ? "true" : undefined}
              data-demo={`${kind}-${index}`}
              onClick={() => onSelect(index)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors duration-150",
                focusRing,
                index === selected
                  ? "bg-ink-900/8 text-ink-900"
                  : "text-ink-500 hover:bg-ink-900/5 hover:text-ink-900",
              )}
            >
              <span className="truncate">{item.name}</span>
              <span className="font-mono text-[10px] text-ink-400 tabular-nums">{item.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {entity ? (
        <div key={entity.name} className="min-w-0 flex-1 px-4 py-3">
          <p className="hy-demo-line text-[18px] font-semibold tracking-[-0.01em] text-ink-900">
            {entity.name}
          </p>
          <p className="hy-demo-line mt-1 text-[11px] text-ink-400" style={demoDelay(1)}>
            {entity.count} mentions
          </p>
          <p className="caps mt-4 text-[0.6rem] text-ink-400">Mentioned in</p>
          <ul className="m-0 mt-1 list-none space-y-1 p-0">
            {entity.recent.map((label, index) => (
              <li
                key={label}
                className="hy-demo-line truncate text-[12.5px] text-ink-700"
                style={demoDelay(index + 2)}
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const outlineGeometry = { rowHeight: 22, rowGap: 2, indent: 10, xBase: 6, corner: 6, inset: 18 };

function outlinePath(outline: OutlineItem[]) {
  const { rowHeight, rowGap, indent, xBase, corner } = outlineGeometry;
  const pitch = rowHeight + rowGap;
  const points: Point[] = [];
  outline.forEach((item, index) => {
    const top = index * pitch;
    const x = xBase + (item.level - 1) * indent;
    const y = top + rowHeight / 2;
    if (points.length === 0) points.push({ x, y: top + 2 });
    const previous = points.at(-1);
    if (previous && Math.abs(previous.x - x) > 0.01) {
      const bridgeY = Math.max(previous.y + 8, y - rowHeight * 0.58);
      points.push({ x: previous.x, y: bridgeY });
      points.push({ x, y: bridgeY });
    }
    points.push({ x, y });
  });
  return { d: roundedPath(points, corner), height: outline.length * pitch - rowGap };
}

function Outline({ outline }: { outline: OutlineItem[] }) {
  const path = outlinePath(outline);
  return (
    <div className="relative">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 w-full overflow-visible"
        style={{ height: path.height }}
      >
        <path d={path.d} fill="none" className="stroke-line" strokeWidth="1.5" />
        <path
          d={path.d}
          fill="none"
          pathLength={100}
          strokeDasharray="100"
          className="hy-demo-outline-trace stroke-ink-900"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span
        aria-hidden
        className="hy-demo-outline-dot absolute top-0 left-0 size-1.5 rounded-full bg-ink-900"
        style={{ offsetPath: `path("${path.d}")`, offsetRotate: "0deg" } as CSSProperties}
      />
      <ol className="relative m-0 grid list-none gap-0.5 p-0">
        {outline.map((item, index) => (
          <li
            key={item.text}
            style={{
              height: outlineGeometry.rowHeight,
              paddingLeft: outlineGeometry.inset + (item.level - 1) * outlineGeometry.indent,
              ...demoDelay(index + 2),
            }}
            className={cn(
              "hy-demo-line flex items-center truncate pr-1 text-[11.5px]",
              index === 0 ? "text-ink-900" : "text-ink-500",
            )}
          >
            {item.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-2.5">
      <p className="mb-1.5 text-[11px] text-ink-400">{title}</p>
      {children}
    </section>
  );
}

function RevisionRow({ revision, fresh }: { revision: Revision; fresh: boolean }) {
  return (
    <li className={cn("flex items-center gap-2 py-[3px]", fresh && "hy-demo-line")}>
      <span className="font-mono text-[10.5px] text-ink-700 tabular-nums">{revision.clock}</span>
      <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-400">
        {revision.relative}
      </span>
      <span
        className={cn(
          "font-mono text-[10.5px] tabular-nums",
          revision.delta.startsWith("+") ? "text-ok" : "text-ink-400",
        )}
      >
        {revision.delta}
      </span>
    </li>
  );
}

function Inspector({ note, draft, saved }: { note: Note; draft: string; saved: boolean }) {
  const words = note.words + countWords(draft);
  const history = saved ? [savedRevision, ...revisions] : revisions;
  const details = [
    { label: "Words", value: words.toLocaleString("en-US") },
    { label: "Read time", value: `${Math.max(1, Math.round(words / 200))}m` },
    { label: "Updated", value: saved ? "Oct 3, 10:21 AM" : note.updated },
  ];
  return (
    <aside className="hidden w-[208px] shrink-0 flex-col border-l border-line bg-ink-50 @min-[900px]:flex">
      <InspectorSection title="Outline">
        <Outline key={note.id} outline={outlineOf(note.blocks)} />
      </InspectorSection>
      <InspectorSection title="Revisions">
        <ul className="m-0 list-none p-0">
          {history.map((revision) => (
            <RevisionRow
              key={revision.clock}
              revision={revision}
              fresh={revision === savedRevision}
            />
          ))}
        </ul>
      </InspectorSection>
      <InspectorSection title={`Links to (${note.links.length})`}>
        {note.links.length === 0 ? (
          <p className="text-[11.5px] text-ink-400">No links yet</p>
        ) : (
          <ul key={note.id} className="m-0 list-none space-y-1 p-0">
            {note.links.map((id, index) => (
              <li
                key={id}
                style={demoDelay(index)}
                className="hy-demo-line truncate text-[11.5px] text-ink-700"
              >
                {notesById.get(id)?.label}
              </li>
            ))}
          </ul>
        )}
      </InspectorSection>
      <dl className="m-0 mt-auto space-y-1.5 border-t border-line px-3 py-2.5">
        {details.map((detail) => (
          <div key={detail.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-ink-400">{detail.label}</dt>
            <dd className="m-0 truncate text-[11px] text-ink-700 tabular-nums">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

type PaletteState = { open: boolean; query: string; selected: number };

const closedPalette: PaletteState = { open: false, query: "", selected: 0 };

function Palette({
  state,
  onPick,
  onClose,
}: {
  state: PaletteState;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const results = paletteResults(state.query);
  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center bg-ink-900/10 px-4 pt-14"
      onClick={onClose}
    >
      <div
        className="hy-demo-pop w-full max-w-[320px] overflow-hidden rounded-lg border border-line bg-surface shadow-(--preview-shadow)"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-[12.5px] text-ink-900">
          <Search className="size-3.5 text-ink-400" />
          <span className="min-w-0 flex-1 truncate">
            {state.query || <span className="text-ink-400">Search notes and commands</span>}
            <span
              aria-hidden
              className="hy-demo-caret ml-px inline-block h-3.5 w-px translate-y-0.5 bg-ink-900"
            />
          </span>
          <kbd className="rounded border border-line px-1 font-mono text-[9px] text-ink-400">
            esc
          </kbd>
        </div>
        <ul className="m-0 list-none p-1">
          {results.map((note, index) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => onPick(note.id)}
                className={cn(
                  "flex h-7 w-full items-center justify-between rounded-md px-2 text-left text-[12px] transition-colors duration-100",
                  focusRing,
                  index === state.selected
                    ? "bg-ink-900/8 text-ink-900"
                    : "text-ink-500 hover:bg-ink-900/5 hover:text-ink-900",
                )}
              >
                <span className="truncate">{note.label}</span>
                <span className="caps text-[0.55rem] text-ink-400">note</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-2 py-1.5 text-[12px] text-ink-400">No notes match.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function KeyChips({ keys }: { keys: string[] }) {
  return (
    <div
      aria-hidden
      className="hy-demo-pop absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 @min-[600px]:bottom-4"
    >
      {keys.map((key) => (
        <kbd
          key={key}
          className="grid h-6 min-w-6 place-items-center rounded-md border border-line bg-surface px-1.5 font-mono text-[10px] text-ink-700 shadow-(--preview-shadow)"
        >
          {key}
        </kbd>
      ))}
    </div>
  );
}

function Cursor({ cursor }: { cursor: CursorState }) {
  return (
    <div
      aria-hidden
      className={cn(
        "hy-demo-cursor pointer-events-none absolute top-0 left-0 z-40",
        cursor.visible ? "opacity-100" : "opacity-0",
      )}
      style={
        {
          "--cursor-x": `${cursor.x}px`,
          "--cursor-y": `${cursor.y}px`,
          "--cursor-scale": cursor.pressed ? 0.82 : 1,
        } as CSSProperties
      }
    >
      <span
        key={cursor.clicks}
        className={cn(
          "absolute -top-2.5 -left-2.5 size-5 rounded-full border border-ink-900/50",
          cursor.clicks > 0 && "hy-demo-click",
        )}
        style={{ opacity: 0 }}
      />
      <svg viewBox="0 0 16 16" className="size-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
        <path
          d="M2 1.5 13 8.2 8 9.3 6.2 14.5Z"
          className="fill-ink-900 stroke-surface"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function visibleTarget(container: HTMLElement, name: string) {
  const candidates = container.querySelectorAll<HTMLElement>(`[data-demo="${name}"]`);
  return Array.from(candidates).find((element) => element.getClientRects().length > 0) ?? null;
}

export function AppPreview() {
  const [view, setView] = useState<View>("notes");
  const [activeId, setActiveId] = useState("welcome");
  const [day, setDay] = useState(today);
  const [entries, setEntries] = useState(journalEntries);
  const [tasks, setTasks] = useState(initialTasks);
  const [tagIndex, setTagIndex] = useState(0);
  const [personIndex, setPersonIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [palette, setPalette] = useState(closedPalette);
  const [keys, setKeys] = useState<string[]>([]);
  const [cursor, setCursor] = useState(idleCursor);

  const frame = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const inView = useInView(frame);
  const { paused, pause, scheduleResume } = usePauseOnInteraction(6000);

  const note = notesById.get(activeId) ?? welcome;
  const entry = entries[day] ?? emptyEntry;
  const noteDraft = activeId === "welcome" ? draft : "";
  const title = view === "notes" ? note.label : viewLabels[view];

  function openNote(id: string) {
    setActiveId(id);
    setView("notes");
    setPalette(closedPalette);
  }

  function openDay(date: number) {
    setDay(date);
    setView("journal");
  }

  function toggleTask(id: string) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    );
  }

  function setMood(mood: Mood) {
    setEntries((current) => ({ ...current, [day]: { ...(current[day] ?? emptyEntry), mood } }));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && palette.open) setPalette(closedPalette);
  }

  function clearOverlays() {
    setPalette(closedPalette);
    setKeys([]);
    setCursor(idleCursor);
  }

  function resetScene() {
    setView("notes");
    setActiveId("welcome");
    setDay(today);
    setEntries(journalEntries);
    setTasks(initialTasks);
    setTagIndex(0);
    setPersonIndex(0);
    setDraft("");
    setSaved(false);
    clearOverlays();
  }

  async function runScript(signal: AbortSignal) {
    let cursorShown = false;

    async function typeInto(sentence: string, write: (text: string) => void) {
      for (let index = 1; index <= sentence.length; index += 1) {
        write(sentence.slice(0, index));
        await sleep(jitter(28, 46), signal);
      }
    }

    async function moveTo(name: string) {
      const container = frame.current;
      const element = container ? visibleTarget(container, name) : null;
      if (!container || !element) return null;
      const point = centerOf(element, container);
      setCursor((current) => ({ ...current, x: point.x, y: point.y }));
      if (!cursorShown) {
        cursorShown = true;
        await sleep(40, signal);
        setCursor((current) => ({ ...current, visible: true }));
        await sleep(360, signal);
        return element;
      }
      await sleep(600, signal);
      return element;
    }

    async function click(name: string) {
      const element = await moveTo(name);
      if (!element) return false;
      setCursor((current) => ({ ...current, pressed: true, clicks: current.clicks + 1 }));
      await sleep(110, signal);
      element.click();
      setCursor((current) => ({ ...current, pressed: false }));
      return true;
    }

    async function press(chord: string[], hold: number) {
      setKeys(chord);
      await sleep(hold, signal);
      setKeys([]);
    }

    resetScene();
    await sleep(1400, signal);

    await typeInto(draftSentence, setDraft);
    await sleep(600, signal);
    setSaved(true);
    await sleep(1800, signal);

    await press(["ctrl", "K"], 420);
    setPalette({ open: true, query: "", selected: 0 });
    await sleep(500, signal);
    await typeInto("link", (query) => setPalette({ open: true, query, selected: 0 }));
    await sleep(650, signal);
    await press(["↵"], 260);
    const [hit] = paletteResults("link");
    setPalette(closedPalette);
    if (hit) setActiveId(hit.id);
    await sleep(2200, signal);

    if (await click("note-launch-checklist")) await sleep(1800, signal);

    await click("rail-tasks");
    await sleep(900, signal);
    await click("task-t1");
    await sleep(1400, signal);

    await click("rail-journal");
    await sleep(900, signal);
    if (!(await click("day-2"))) await click("day-prev");
    await sleep(800, signal);
    await click("mood-great");
    await sleep(1600, signal);

    await click("rail-tags");
    await sleep(800, signal);
    await click("tags-1");
    await sleep(1600, signal);

    await click("rail-notes");
    await sleep(600, signal);
    setCursor((current) => ({ ...current, visible: false }));
    await sleep(1200, signal);
  }

  useAutopilot(runScript, inView && !paused && !reducedMotion, clearOverlays);

  return (
    <div
      ref={frame}
      data-autopilot={paused ? "paused" : "running"}
      onPointerEnter={pause}
      onPointerLeave={scheduleResume}
      onFocusCapture={pause}
      onBlurCapture={(event) => {
        if (!frame.current?.contains(event.relatedTarget as Node | null)) scheduleResume();
      }}
      onKeyDown={onKeyDown}
      className="@container relative flex h-[440px] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink-700 shadow-(--preview-shadow) select-none sm:h-[480px] lg:h-[520px]"
    >
      {palette.open ? (
        <Palette state={palette} onPick={openNote} onClose={() => setPalette(closedPalette)} />
      ) : null}
      {keys.length > 0 ? <KeyChips keys={keys} /> : null}
      <Cursor cursor={cursor} />

      <div className="flex min-h-0 flex-1">
        <Rail view={view} onSelect={setView} />
        <Sidebar
          view={view}
          activeId={activeId}
          day={day}
          onOpenNote={openNote}
          onOpenDay={openDay}
          onOpenPalette={() => setPalette({ open: true, query: "", selected: 0 })}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <TopBar
            title={title}
            onOpenPalette={() => setPalette({ open: true, query: "", selected: 0 })}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            {view === "notes" ? (
              <NotePane note={note} draft={activeId === "welcome" ? draft : undefined} />
            ) : view === "journal" ? (
              <JournalPane
                date={day}
                entry={entry}
                onMood={setMood}
                onStep={(delta) =>
                  setDay((current) => Math.min(today, Math.max(1, current + delta)))
                }
              />
            ) : view === "tasks" ? (
              <TasksPane tasks={tasks} onToggle={toggleTask} />
            ) : view === "tags" ? (
              <EntityPane kind="tags" entities={tags} selected={tagIndex} onSelect={setTagIndex} />
            ) : (
              <EntityPane
                kind="people"
                entities={people}
                selected={personIndex}
                onSelect={setPersonIndex}
              />
            )}
          </div>
        </main>
        {view === "notes" ? (
          <Inspector note={note} draft={noteDraft} saved={saved && activeId === "welcome"} />
        ) : null}
      </div>

      <TabBar view={view} onSelect={setView} />
    </div>
  );
}
