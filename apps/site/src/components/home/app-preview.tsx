"use client";

import { useRef, useState } from "react";
import type { CSSProperties, ReactNode, SVGProps } from "react";
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
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Search,
  Users,
} from "@/components/ui/icons";

type Props = SVGProps<SVGSVGElement>;

function glyph(props: Props) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

function Folder(props: Props) {
  return (
    <svg {...glyph(props)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function Tag(props: Props) {
  return (
    <svg {...glyph(props)}>
      <path d="M3 12V4h8l9 9-8 8Z" />
      <circle cx="7.5" cy="8.5" r="1" />
    </svg>
  );
}

function Trash(props: Props) {
  return (
    <svg {...glyph(props)}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

function Gear(props: Props) {
  return (
    <svg {...glyph(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M4.9 19.1 7 17m10-10 2.1-2.1" />
    </svg>
  );
}

function Panel(props: Props) {
  return (
    <svg {...glyph(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M9 5v14" />
    </svg>
  );
}

function PanelRight(props: Props) {
  return (
    <svg {...glyph(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M15 5v14" />
    </svg>
  );
}

function Wordmark(props: Props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <g fill="currentColor" transform="translate(0.84 0) skewX(-4)">
        <rect x="4.3" y="6.4" width="4.7" height="12.4" rx="1" />
        <rect x="9.7" y="3.6" width="5" height="17.8" rx="1.2" />
        <rect x="15.4" y="6.4" width="4.7" height="12.4" rx="1" />
      </g>
    </svg>
  );
}

type View = "notes" | "journal" | "tasks";

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string };

type OutlineItem = Extract<Block, { kind: "heading" }>;

type Note = {
  id: string;
  label: string;
  words: string;
  updated: string;
  blocks: Block[];
};

const rail: Array<{
  view: View;
  Icon: (props: Props) => ReactNode;
  label: string;
}> = [
  { view: "notes", Icon: Folder, label: "Notes" },
  { view: "journal", Icon: CalendarRange, label: "Journal" },
  { view: "tasks", Icon: ListTodo, label: "Tasks" },
];

const notes: Note[] = [
  {
    id: "local-first",
    label: "Local-first, actually",
    words: "846",
    updated: "Sep 26, 2:32 PM",
    blocks: [
      { kind: "heading", level: 1, text: "Notes that never make you wait" },
      {
        kind: "paragraph",
        text: "A local-first workspace where every keystroke is already yours.",
      },
      { kind: "heading", level: 2, text: "The 8 ms budget" },
      {
        kind: "paragraph",
        text: "Typing paints in the same frame. There is nothing to wait for.",
      },
      { kind: "heading", level: 3, text: "Always local" },
      {
        kind: "paragraph",
        text: "Your writing lives on your device before it travels anywhere else.",
      },
      { kind: "heading", level: 2, text: "A calm place to write" },
    ],
  },
  {
    id: "linking",
    label: "Linking",
    words: "312",
    updated: "Sep 24, 11:08 AM",
    blocks: [
      { kind: "heading", level: 1, text: "Linking notes together" },
      {
        kind: "paragraph",
        text: "Type [[ and pick a note. Backlinks show up on the other side.",
      },
      { kind: "heading", level: 2, text: "Wikilinks" },
      {
        kind: "paragraph",
        text: "Links survive renames because they point at the note, not the title.",
      },
      { kind: "heading", level: 2, text: "Tags and people" },
      {
        kind: "paragraph",
        text: "#tags and @people become chips you can search and filter on.",
      },
    ],
  },
  {
    id: "writing",
    label: "Writing",
    words: "528",
    updated: "Sep 22, 4:47 PM",
    blocks: [
      { kind: "heading", level: 1, text: "Writing in Markdown" },
      {
        kind: "paragraph",
        text: "Plain files on disk. Open them in any editor you like.",
      },
      { kind: "heading", level: 2, text: "Slash menu" },
      {
        kind: "paragraph",
        text: "Type / for headings, lists, code, tables and diagrams.",
      },
      { kind: "heading", level: 2, text: "Vim mode" },
      {
        kind: "paragraph",
        text: "Modal editing for people who never want to reach for the mouse.",
      },
    ],
  },
  {
    id: "release-post",
    label: "Draft: release post",
    words: "1,204",
    updated: "Sep 26, 9:15 AM",
    blocks: [
      { kind: "heading", level: 1, text: "Skriuw 0.46 is out" },
      {
        kind: "paragraph",
        text: "Locked notes, a faster search index and a journal that keeps up.",
      },
      { kind: "heading", level: 2, text: "Locked notes" },
      {
        kind: "paragraph",
        text: "A PIN or passphrase per note, encrypted with its own key.",
      },
      { kind: "heading", level: 2, text: "Search" },
      {
        kind: "paragraph",
        text: "tag: and person: operators, saved searches, instant results.",
      },
    ],
  },
  {
    id: "launch-checklist",
    label: "Launch checklist",
    words: "190",
    updated: "Sep 25, 6:02 PM",
    blocks: [
      { kind: "heading", level: 1, text: "Launch checklist" },
      {
        kind: "paragraph",
        text: "Everything that has to be true before the tag goes out.",
      },
      { kind: "heading", level: 2, text: "Before" },
      {
        kind: "paragraph",
        text: "Changelog written, screenshots refreshed, installers smoke-tested.",
      },
      { kind: "heading", level: 2, text: "After" },
      {
        kind: "paragraph",
        text: "Post the release, watch the crash reports, sleep.",
      },
    ],
  },
  {
    id: "welcome",
    label: "Welcome",
    words: "141",
    updated: "Sep 12, 9:14 AM",
    blocks: [
      { kind: "heading", level: 1, text: "Welcome to Skriuw" },
      {
        kind: "paragraph",
        text: "This note is yours. Edit it, delete it, or keep it around.",
      },
      { kind: "heading", level: 2, text: "Start here" },
      {
        kind: "paragraph",
        text: "Press ctrl+k to jump anywhere. Press / to insert anything.",
      },
    ],
  },
];

const notesById = new Map(notes.map((note) => [note.id, note]));

type TreeNode =
  | { kind: "folder"; label: string; count: number; open: boolean }
  | { kind: "note"; id: string; depth?: number };

const tree: TreeNode[] = [
  { kind: "folder", label: "Guides", count: 2, open: true },
  { kind: "note", id: "linking", depth: 1 },
  { kind: "note", id: "writing", depth: 1 },
  { kind: "folder", label: "Ideas", count: 1, open: false },
  { kind: "folder", label: "Projects", count: 3, open: true },
  { kind: "note", id: "local-first", depth: 1 },
  { kind: "note", id: "release-post", depth: 1 },
  { kind: "note", id: "launch-checklist", depth: 1 },
  { kind: "note", id: "welcome" },
];

const weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const calendar = Array.from({ length: 35 }, (_, index) => {
  const date = index === 0 ? 31 : index <= 30 ? index : index - 30;
  return { date, muted: index === 0 || index > 30, today: index === 27 };
});

const moods = ["😌", "🙂", "😐", "😴", "🔥"] as const;

type JournalEntry = { mood: (typeof moods)[number]; blocks: Block[] };

const journalEntries: Record<number, JournalEntry> = {
  27: {
    mood: "🙂",
    blocks: [
      { kind: "heading", level: 1, text: "Saturday, September 27" },
      {
        kind: "paragraph",
        text: "Slow morning. Rewrote the hero copy three times, kept the shortest one.",
      },
      {
        kind: "paragraph",
        text: "The preview on the homepage is finally something you can click.",
      },
    ],
  },
  26: {
    mood: "🔥",
    blocks: [
      { kind: "heading", level: 1, text: "Friday, September 26" },
      {
        kind: "paragraph",
        text: "Shipped the framed site design. Every page shares one frame now.",
      },
      {
        kind: "paragraph",
        text: "Moved the demo vault into the fixtures folder. Long overdue.",
      },
    ],
  },
  25: {
    mood: "😐",
    blocks: [
      { kind: "heading", level: 1, text: "Thursday, September 25" },
      {
        kind: "paragraph",
        text: "CI was flaky all afternoon. Sharded the gate and it dropped to four minutes.",
      },
    ],
  },
  24: {
    mood: "😌",
    blocks: [
      { kind: "heading", level: 1, text: "Wednesday, September 24" },
      {
        kind: "paragraph",
        text: "Quiet day. Cleaned the root test config and read on the balcony.",
      },
    ],
  },
};

const defaultEntry: JournalEntry = {
  mood: "😐",
  blocks: [
    { kind: "heading", level: 1, text: "No entry yet" },
    { kind: "paragraph", text: "Start typing and the day fills itself in." },
  ],
};

const initialTasks = [
  { id: "t1", text: "Tighten the hero line height", done: true, due: "today" },
  {
    id: "t2",
    text: "Make the homepage preview interactive",
    done: false,
    due: "today",
  },
  {
    id: "t3",
    text: "Refresh screenshots for the release post",
    done: false,
    due: "Mon",
  },
  {
    id: "t4",
    text: "Smoke-test the Linux installers",
    done: false,
    due: "Mon",
  },
  { id: "t5", text: "Reply to the sync bug report", done: true, due: "Sep 25" },
];

const draftSentence = "Every keystroke lands in the same frame it was typed in.";

type Revision =
  | { group: string; clock?: undefined }
  | { group?: undefined; clock: string; relative: string; delta: string };

const savedRevision: Revision = {
  clock: "14:34",
  relative: "just now",
  delta: "+10",
};

const revisions: Revision[] = [
  { group: "Today" },
  { clock: "14:32", relative: "2 min ago", delta: "+18" },
  { clock: "13:05", relative: "1 h ago", delta: "+142" },
  { clock: "09:41", relative: "5 h ago", delta: "−6" },
  { group: "Yesterday" },
  { clock: "18:20", relative: "1 d ago", delta: "+311" },
];

function outlineOf(blocks: Block[]): OutlineItem[] {
  return blocks.filter((block): block is OutlineItem => block.kind === "heading");
}

const outlineGeometry = {
  rowHeight: 22,
  rowGap: 2,
  indent: 10,
  xBase: 6,
  corner: 6,
  textInset: 18,
};

function roundedPath(points: Array<{ x: number; y: number }>, radius: number): string {
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const localRadius = Math.min(radius, incoming / 2, outgoing / 2);
    const startRatio = incoming ? localRadius / incoming : 0;
    const endRatio = outgoing ? localRadius / outgoing : 0;
    const start = {
      x: current.x + (previous.x - current.x) * startRatio,
      y: current.y + (previous.y - current.y) * startRatio,
    };
    const end = {
      x: current.x + (next.x - current.x) * endRatio,
      y: current.y + (next.y - current.y) * endRatio,
    };
    path += ` L ${start.x} ${start.y} Q ${current.x} ${current.y} ${end.x} ${end.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L ${last.x} ${last.y}`;
}

function buildOutlinePath(outline: OutlineItem[]) {
  const { rowHeight, rowGap, indent, xBase, corner } = outlineGeometry;
  const pitch = rowHeight + rowGap;
  const points: Array<{ x: number; y: number }> = [];

  outline.forEach((item, index) => {
    const top = index * pitch;
    const x = xBase + (item.level - 1) * indent;
    const y = top + rowHeight / 2;
    if (points.length === 0) {
      points.push({ x, y: top + 2 });
    }
    const previous = points.at(-1)!;
    if (Math.abs(previous.x - x) > 0.01) {
      const direction = x > previous.x ? 1 : -1;
      const bridgeY = Math.max(previous.y + 8, y - rowHeight * 0.58);
      points.push({ x: previous.x, y: bridgeY });
      points.push({
        x: x - direction * Math.min(2, corner * 0.18),
        y: bridgeY,
      });
    }
    points.push({ x, y });
  });

  return {
    d: roundedPath(points, corner),
    height: outline.length * pitch - rowGap,
  };
}

function OutlineSection({ outline }: { outline: OutlineItem[] }) {
  const outlinePath = buildOutlinePath(outline);
  return (
    <nav aria-label="Note outline" className="relative">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 w-full overflow-visible"
        style={{ height: outlinePath.height }}
      >
        <path
          d={outlinePath.d}
          fill="none"
          className="stroke-ink-300"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={outlinePath.d}
          fill="none"
          pathLength={100}
          className="hy-demo-outline-trace stroke-ink-900"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100"
        />
      </svg>
      <span
        aria-hidden
        className="hy-demo-outline-dot absolute top-0 left-0 size-1.5 rounded-full bg-ink-900"
        style={
          {
            offsetPath: `path("${outlinePath.d}")`,
            offsetRotate: "0deg",
          } as CSSProperties
        }
      />
      <ol className="relative m-0 grid list-none gap-0.5 p-0">
        {outline.map((item, index) => (
          <li key={item.text} className="min-w-0">
            <span
              style={
                {
                  height: outlineGeometry.rowHeight,
                  paddingLeft:
                    outlineGeometry.textInset + (item.level - 1) * outlineGeometry.indent,
                  "--demo-delay": `${index * 0.65}s`,
                } as CSSProperties
              }
              className={cn(
                "hy-demo-outline flex items-center truncate pr-1 text-[11px]",
                item.level === 2 ? "font-medium text-ink-900" : "text-ink-500",
              )}
            >
              {item.text}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border/60 px-3 pt-2 pb-2.5 last:border-b-0">
      <p className="mb-1.5 text-[10.5px] font-medium text-ink-400">{title}</p>
      {children}
    </section>
  );
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function NormalInspector({ note, draft, saved }: { note: Note; draft: string; saved: boolean }) {
  const wordCount = Number(note.words.replace(",", "")) + countWords(draft);
  const details = [
    { label: "Words", value: wordCount.toLocaleString("en-US") },
    {
      label: "Read time",
      value: `${Math.max(1, Math.round(wordCount / 200))}m`,
    },
    { label: "Created", value: "Sep 12, 9:14 AM" },
    { label: "Updated", value: saved ? "Sep 26, 2:34 PM" : note.updated },
  ];
  const history = saved ? [revisions[0]!, savedRevision, ...revisions.slice(1)] : revisions;
  return (
    <aside className="hidden w-[188px] shrink-0 flex-col border-l border-border lg:flex">
      <InspectorSection title="Outline">
        <OutlineSection key={note.id} outline={outlineOf(note.blocks)} />
      </InspectorSection>

      <InspectorSection title="Git history">
        <ul className="m-0 list-none p-0">
          {history.map((revision) =>
            revision.group !== undefined ? (
              <li
                key={revision.group}
                className="pt-2 pb-1 text-[9px] font-semibold tracking-[0.14em] text-ink-400 uppercase first:pt-0"
              >
                {revision.group}
              </li>
            ) : (
              <li
                key={revision.clock}
                className={cn(
                  "flex items-center gap-1.5 py-[3px]",
                  revision === savedRevision && "hy-demo-line",
                )}
              >
                <span className="font-mono text-[10.5px] text-ink-500 tabular-nums">
                  {revision.clock}
                </span>
                <span className="min-w-0 flex-1 truncate text-[9.5px] text-ink-400">
                  {revision.relative}
                </span>
                <span
                  className={cn(
                    "font-mono text-[10.5px] tabular-nums",
                    revision.delta === "−6" ? "text-ink-500" : "text-emerald-600/80",
                  )}
                >
                  {revision.delta}
                </span>
              </li>
            ),
          )}
        </ul>
      </InspectorSection>

      <InspectorSection title="Details">
        <dl className="m-0 space-y-1.5">
          {details.map((detail) => (
            <div key={detail.label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-[11px] text-ink-400">{detail.label}</dt>
              <dd className="m-0 truncate text-right text-[11px] font-medium text-ink-700 tabular-nums">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      </InspectorSection>
    </aside>
  );
}

function Document({ blocks, id, draft }: { blocks: Block[]; id: string; draft?: string }) {
  return (
    <article
      key={id}
      className="hy-demo-document mt-4 space-y-2.5 text-[11.5px] leading-[1.7] text-ink-700"
    >
      {blocks.map((block, index) =>
        block.kind === "heading" ? (
          <p
            key={block.text}
            className={cn(
              "hy-demo-line flex items-baseline gap-2 font-semibold text-ink-900",
              block.level === 1 && "text-[22px] leading-none tracking-[-0.02em]",
              block.level === 2 && "pt-1 text-[14px]",
              block.level === 3 && "pl-3 text-[12px]",
            )}
            style={{ "--demo-delay": `${index * 0.12}s` } as CSSProperties}
          >
            <span className="font-mono text-[10px] font-normal text-clay-500">
              {"#".repeat(block.level)}
            </span>
            {block.text}
          </p>
        ) : (
          <p
            key={block.text}
            className="hy-demo-line text-ink-500"
            style={{ "--demo-delay": `${index * 0.12}s` } as CSSProperties}
          >
            {block.text}
          </p>
        ),
      )}
      <p className="text-ink-700">
        {draft}
        <span
          aria-hidden
          className="hy-demo-caret ml-px inline-block h-3 w-px translate-y-0.5 bg-clay-500"
        />
      </p>
    </article>
  );
}

function NoteTree({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex-1 p-1.5">
      {tree.map((node) => {
        if (node.kind === "folder") {
          return (
            <div
              key={node.label}
              className="flex h-[22px] items-center gap-1.5 rounded-md pr-1.5 pl-1.5 text-[11px] text-ink-500"
            >
              <span aria-hidden className="w-2 text-[8px] text-ink-400">
                {node.open ? "⌄" : "›"}
              </span>
              <Folder className="size-3 text-ink-400" />
              <span className="truncate">{node.label}</span>
              <span className="ml-auto font-mono text-[10px] text-ink-400 tabular-nums">
                {node.count}
              </span>
            </div>
          );
        }
        const note = notesById.get(node.id)!;
        const active = node.id === activeId;
        return (
          <button
            key={node.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(node.id)}
            style={{ paddingLeft: `${6 + (node.depth ?? 0) * 12}px` }}
            className={cn(
              "flex h-[22px] w-full items-center gap-1.5 rounded-md pr-1.5 text-left text-[11px] transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-accent",
              active
                ? "bg-ink-100 font-medium text-ink-900"
                : "text-ink-500 hover:bg-ink-100/60 hover:text-ink-700",
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
  onSelect,
  interactive,
}: {
  selected: number;
  onSelect: (date: number) => void;
  interactive: boolean;
}) {
  return (
    <div className="border-t border-border px-2 pt-2 pb-1.5">
      <div className="flex items-center gap-1 text-ink-400">
        <ChevronLeft className="size-3" />
        <ChevronRight className="size-3" />
        <span className="ml-2 text-[10px] font-medium text-ink-700">September 2026</span>
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-y-0.5 text-center font-mono text-[8.5px] text-ink-400">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
        {calendar.map((cell, index) => {
          const hasEntry = !cell.muted && cell.date in journalEntries;
          const isSelected = interactive && !cell.muted && cell.date === selected;
          return (
            <button
              key={index}
              type="button"
              tabIndex={interactive && !cell.muted ? 0 : -1}
              disabled={!interactive || cell.muted}
              data-demo={cell.muted ? undefined : `day-${cell.date}`}
              onClick={() => onSelect(cell.date)}
              className={cn(
                "relative mx-auto grid size-4 place-items-center rounded-sm tabular-nums outline-none transition-colors duration-100 focus-visible:ring-1 focus-visible:ring-accent",
                cell.muted && "text-ink-300",
                cell.today && "font-semibold text-ink-900",
                interactive && !cell.muted && "hover:bg-ink-100",
                isSelected && "bg-ink-900 text-surface hover:bg-ink-900",
              )}
            >
              {cell.date}
              {hasEntry && !isSelected ? (
                <span
                  aria-hidden
                  className="absolute bottom-px left-1/2 size-0.5 -translate-x-1/2 rounded-full bg-clay-500"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function JournalPane({
  date,
  entry,
  onMood,
}: {
  date: number;
  entry: JournalEntry;
  onMood: (mood: JournalEntry["mood"]) => void;
}) {
  return (
    <div className="min-w-0 flex-1 px-7 py-4">
      <div className="flex items-center justify-between text-[10px] text-ink-400">
        <span className="caps text-[0.58rem]">journal · day {date}</span>
        <span className="flex items-center gap-0.5">
          {moods.map((mood) => (
            <button
              key={mood}
              type="button"
              aria-label={`Mood ${mood}`}
              aria-pressed={entry.mood === mood}
              data-demo={`mood-${mood}`}
              onClick={() => onMood(mood)}
              className={cn(
                "grid size-5 place-items-center rounded-md text-[11px] transition-[transform,opacity] duration-100 ease-[var(--ease-out)] outline-none active:scale-[0.95] [@media(hover:hover)]:hover:scale-110 focus-visible:ring-1 focus-visible:ring-accent",
                entry.mood === mood ? "bg-ink-100" : "opacity-45 hover:opacity-100",
              )}
            >
              {mood}
            </button>
          ))}
        </span>
      </div>
      <Document id={`journal-${date}`} blocks={entry.blocks} />
    </div>
  );
}

function TasksPane({
  tasks,
  onToggle,
}: {
  tasks: typeof initialTasks;
  onToggle: (id: string) => void;
}) {
  const open = tasks.filter((task) => !task.done).length;
  return (
    <div className="min-w-0 flex-1 px-7 py-4">
      <div className="flex items-center justify-between text-[10px] text-ink-400">
        <span className="caps text-[0.58rem]">tasks · {open} open</span>
        <span className="caps text-[0.58rem]">from every note</span>
      </div>
      <ul className="hy-demo-document m-0 mt-4 list-none space-y-1 p-0">
        {tasks.map((task, index) => (
          <li
            key={task.id}
            className="hy-demo-line"
            style={{ "--demo-delay": `${index * 0.08}s` } as CSSProperties}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={task.done}
              data-demo={`task-${task.id}`}
              onClick={() => onToggle(task.id)}
              className="group flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left text-[11.5px] transition-colors duration-100 outline-none hover:bg-ink-100/60 focus-visible:ring-1 focus-visible:ring-accent"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors duration-160 ease-[var(--ease-out)]",
                  task.done
                    ? "border-clay-500 bg-clay-500 text-accent-fg"
                    : "border-ink-300 bg-surface group-hover:border-ink-500",
                )}
              >
                <Check
                  className={cn(
                    "size-2.5 transition-[transform,opacity] duration-160 ease-[var(--ease-out)]",
                    task.done ? "scale-100 opacity-100" : "scale-[0.8] opacity-0",
                  )}
                />
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate transition-colors duration-120",
                  task.done ? "text-ink-400 line-through" : "text-ink-700",
                )}
              >
                {task.text}
              </span>
              <span className="caps shrink-0 text-[0.55rem] text-ink-400">{task.due}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const paneTitle: Record<View, string> = {
  notes: "",
  journal: "Journal",
  tasks: "Tasks",
};

type PaletteState = { open: boolean; query: string };

const closedPalette: PaletteState = { open: false, query: "" };

function paletteResults(query: string) {
  const needle = query.trim().toLowerCase();
  return notes.filter((note) => !needle || note.label.toLowerCase().includes(needle)).slice(0, 5);
}

function Palette({ state }: { state: PaletteState }) {
  const results = paletteResults(state.query);
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-20 flex items-start justify-center bg-surface/55 pt-12 backdrop-blur-[1.5px]"
    >
      <div className="hy-demo-pop w-[280px] overflow-hidden rounded-lg border border-border bg-surface shadow-(--preview-shadow)">
        <div className="flex h-8 items-center gap-2 border-b border-border px-2.5 text-[11.5px] text-ink-900">
          <Search className="size-3 text-ink-400" />
          <span className="flex-1">
            {state.query || <span className="text-ink-400">Jump to a note…</span>}
            <span className="hy-demo-caret ml-px inline-block h-3 w-px translate-y-0.5 bg-clay-500" />
          </span>
          <kbd className="rounded border border-line px-1 font-mono text-[9px] text-ink-400">
            esc
          </kbd>
        </div>
        <ul className="m-0 list-none p-1">
          {results.map((note, index) => (
            <li
              key={note.id}
              className={cn(
                "flex h-6 items-center justify-between rounded-md px-2 text-[11px]",
                index === 0 ? "bg-ink-100 text-ink-900" : "text-ink-500",
              )}
            >
              <span className="truncate">{note.label}</span>
              <span className="caps text-[0.5rem] text-ink-400">note</span>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-2 py-1.5 text-[11px] text-ink-400">No notes match.</li>
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
      className="hy-demo-pop absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1"
    >
      {keys.map((key) => (
        <kbd
          key={key}
          className="grid h-6 min-w-6 place-items-center rounded-md border border-line bg-hy-card px-1.5 font-mono text-[10px] text-ink-700 shadow-(--preview-shadow)"
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

export function AppPreview() {
  const [view, setView] = useState<View>("notes");
  const [activeId, setActiveId] = useState("local-first");
  const [day, setDay] = useState(27);
  const [entries, setEntries] = useState(journalEntries);
  const [tasks, setTasks] = useState(initialTasks);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [palette, setPalette] = useState(closedPalette);
  const [keys, setKeys] = useState<string[]>([]);
  const [cursor, setCursor] = useState(idleCursor);

  const frame = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const inView = useInView(frame);
  const { paused, pause, scheduleResume } = usePauseOnInteraction(2500);

  const note = notesById.get(activeId)!;
  const entry = entries[day] ?? defaultEntry;

  function toggleTask(id: string) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    );
  }

  function setMood(mood: JournalEntry["mood"]) {
    setEntries((current) => ({
      ...current,
      [day]: { ...(current[day] ?? defaultEntry), mood },
    }));
  }

  function clearOverlays() {
    setPalette(closedPalette);
    setKeys([]);
    setCursor(idleCursor);
  }

  function resetScene() {
    setView("notes");
    setActiveId("local-first");
    setDay(27);
    setEntries(journalEntries);
    setTasks(initialTasks);
    setDraft("");
    setSaved(false);
    clearOverlays();
  }

  async function runScript(signal: AbortSignal) {
    let cursorShown = false;

    async function typeInto(sentence: string, write: (text: string) => void) {
      for (let index = 1; index <= sentence.length; index += 1) {
        write(sentence.slice(0, index));
        await sleep(jitter(26, 48), signal);
      }
    }

    async function moveTo(target: string) {
      const container = frame.current;
      const element = container?.querySelector(`[data-demo="${target}"]`);
      if (!container || !element) return null;
      const point = centerOf(element, container);
      if (!cursorShown) {
        cursorShown = true;
        setCursor((current) => ({ ...current, x: point.x, y: point.y }));
        await sleep(40, signal);
        setCursor((current) => ({ ...current, visible: true }));
        await sleep(360, signal);
        return element;
      }
      setCursor((current) => ({ ...current, x: point.x, y: point.y }));
      await sleep(560, signal);
      return element;
    }

    async function click(target: string) {
      const element = await moveTo(target);
      if (!(element instanceof HTMLElement)) return;
      setCursor((current) => ({
        ...current,
        pressed: true,
        clicks: current.clicks + 1,
      }));
      await sleep(110, signal);
      element.click();
      setCursor((current) => ({ ...current, pressed: false }));
    }

    async function press(chord: string[], hold: number) {
      setKeys(chord);
      await sleep(hold, signal);
      setKeys([]);
    }

    resetScene();
    await sleep(1600, signal);

    await typeInto(draftSentence, setDraft);
    await sleep(500, signal);
    setSaved(true);
    await sleep(1600, signal);

    await press(["ctrl", "K"], 420);
    setPalette({ open: true, query: "" });
    await sleep(520, signal);
    await typeInto("link", (query) => setPalette({ open: true, query }));
    await sleep(700, signal);
    await press(["↵"], 260);
    const [hit] = paletteResults("link");
    setPalette(closedPalette);
    if (hit) setActiveId(hit.id);
    await sleep(2400, signal);

    await click("rail-tasks");
    await sleep(900, signal);
    await click("task-t2");
    await sleep(1500, signal);

    await click("rail-journal");
    await sleep(900, signal);
    await click("day-25");
    await sleep(800, signal);
    await click("mood-🔥");
    await sleep(1600, signal);

    await click("rail-notes");
    await sleep(700, signal);
    setCursor((current) => ({ ...current, visible: false }));
    await sleep(900, signal);
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
        if (!frame.current?.contains(event.relatedTarget as Node | null)) {
          scheduleResume();
        }
      }}
      className="relative flex h-[480px] w-full overflow-hidden rounded-xl border border-border bg-surface text-ink-700 shadow-(--preview-shadow)"
    >
      {palette.open ? <Palette state={palette} /> : null}
      {keys.length > 0 ? <KeyChips keys={keys} /> : null}
      <Cursor cursor={cursor} />
      <nav
        aria-label="Preview views"
        className="flex w-9 shrink-0 flex-col items-center border-r border-border py-2"
      >
        <Wordmark className="size-4 text-ink-900" />
        <div className="mt-3 flex flex-col gap-1">
          {rail.map(({ view: target, Icon, label }) => (
            <button
              key={target}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={view === target}
              data-demo={`rail-${target}`}
              onClick={() => setView(target)}
              className={cn(
                "grid size-7 place-items-center rounded-md transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-accent",
                view === target
                  ? "bg-ink-100 text-ink-900"
                  : "text-ink-400 hover:bg-ink-100/60 hover:text-ink-700",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
          <span className="grid size-7 place-items-center text-ink-400">
            <Tag className="size-3.5" />
          </span>
          <span className="grid size-7 place-items-center text-ink-400">
            <Users className="size-3.5" />
          </span>
        </div>
        <div className="mt-auto flex flex-col gap-1 text-ink-400">
          <span className="grid size-7 place-items-center">
            <Trash className="size-3.5" />
          </span>
          <span className="grid size-7 place-items-center">
            <Gear className="size-3.5" />
          </span>
        </div>
      </nav>

      <aside className="flex w-[164px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-2 py-1.5 text-ink-400">
          <span className="grid size-5 place-items-center">
            <Search className="size-3" />
          </span>
          <span className="grid size-5 place-items-center">
            <ListTodo className="size-3" />
          </span>
          <span className="grid size-5 place-items-center">
            <Folder className="size-3" />
          </span>
          <span className="grid size-5 place-items-center">
            <Tag className="size-3" />
          </span>
          <span className="grid size-5 place-items-center">
            <Panel className="size-3" />
          </span>
        </div>

        <NoteTree
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            setView("notes");
          }}
        />

        <MiniCalendar
          selected={day}
          interactive={view === "journal"}
          onSelect={(date) => {
            setDay(date);
            setView("journal");
          }}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center gap-2 border-b border-border px-2 text-ink-400">
          <Panel className="size-3.5" />
          <ChevronLeft className="size-3.5" />
          <ChevronRight className="size-3.5" />
          <span className="flex-1 truncate text-center text-[11.5px] text-ink-900">
            {view === "notes" ? note.label : paneTitle[view]}
          </span>
          <Search className="size-3.5" />
          <PanelRight className="size-3.5" />
        </div>

        {view === "notes" ? (
          <div className="min-w-0 flex-1 px-7 py-4">
            <div className="flex items-center justify-between text-[10px] text-ink-400">
              <span className="flex items-center gap-1">
                <span aria-hidden className="text-[8px]">
                  ›
                </span>
                Properties <span className="text-ink-300">(3)</span>
              </span>
              <span className="caps text-[0.58rem]">add cover</span>
            </div>
            <Document
              id={note.id}
              blocks={note.blocks}
              draft={activeId === "local-first" ? draft : ""}
            />
          </div>
        ) : view === "journal" ? (
          <JournalPane date={day} entry={entry} onMood={setMood} />
        ) : (
          <TasksPane tasks={tasks} onToggle={toggleTask} />
        )}
      </div>

      {view === "notes" ? (
        <NormalInspector
          note={note}
          draft={activeId === "local-first" ? draft : ""}
          saved={saved && activeId === "local-first"}
        />
      ) : null}
    </div>
  );
}
