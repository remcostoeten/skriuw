import type { ReactNode, SVGProps } from "react";
import { cn } from "@skriuw/shared/helpers/cn";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Search,
  Users,
} from "@/components/ui/icons";

type IconProps = SVGProps<SVGSVGElement>;

function glyph(props: IconProps) {
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

function Folder(props: IconProps) {
  return (
    <svg {...glyph(props)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function Tag(props: IconProps) {
  return (
    <svg {...glyph(props)}>
      <path d="M3 12V4h8l9 9-8 8Z" />
      <circle cx="7.5" cy="8.5" r="1" />
    </svg>
  );
}

function Trash(props: IconProps) {
  return (
    <svg {...glyph(props)}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

function Gear(props: IconProps) {
  return (
    <svg {...glyph(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M4.9 19.1 7 17m10-10 2.1-2.1" />
    </svg>
  );
}

function Panel(props: IconProps) {
  return (
    <svg {...glyph(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M9 5v14" />
    </svg>
  );
}

function PanelRight(props: IconProps) {
  return (
    <svg {...glyph(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M15 5v14" />
    </svg>
  );
}

function Wordmark(props: IconProps) {
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

const rail = [
  { Icon: Folder, active: true },
  { Icon: CalendarRange, active: false },
  { Icon: ListTodo, active: false },
  { Icon: Tag, active: false },
  { Icon: Users, active: false },
];

const tree = [
  { label: "Guides", kind: "folder" as const, count: 2, open: true },
  { label: "Linking", kind: "note" as const, depth: 1 },
  { label: "Writing", kind: "note" as const, depth: 1 },
  { label: "Ideas", kind: "folder" as const, count: 1, open: false },
  { label: "Projects", kind: "folder" as const, count: 3, open: true },
  { label: "Local-first, actually", kind: "note" as const, depth: 1, active: true },
  { label: "Draft: release post", kind: "note" as const, depth: 1 },
  { label: "Launch checklist", kind: "note" as const, depth: 1 },
  { label: "Welcome", kind: "note" as const },
];

const weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const calendar = Array.from({ length: 35 }, (_, index) => {
  const date = index === 0 ? 31 : index <= 30 ? index : index - 30;
  return { date, muted: index === 0 || index > 30, today: index === 26 };
});

const outline = ["Local-first, actually", "The test", "The 8 ms budget", "Where the data lives"];
const linksTo = ["The 8 ms budget", "Launch checklist", "Writing"];
const stats = [
  { key: "Words", value: "846" },
  { key: "Characters", value: "5,102" },
  { key: "Read time", value: "4m" },
  { key: "Revisions", value: "23" },
  { key: "Updated", value: "2 min ago" },
];

type ChipProps = {
  sigil: string;
  children: ReactNode;
};

function Chip({ sigil, children }: ChipProps) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-ink-100 px-1 py-px text-[10.5px] text-ink-700">
      <span className="text-ink-400">{sigil}</span>
      {children}
    </span>
  );
}

function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <p className="flex items-center gap-1 text-[10px] text-ink-400">
      <span aria-hidden className="text-[8px]">⌄</span>
      {children}
      {count !== undefined ? <span className="text-ink-300">({count})</span> : null}
    </p>
  );
}

export function HybridAppPreview() {
  return (
    <div className="flex h-[480px] w-full overflow-hidden rounded-xl border border-border bg-surface text-ink-700 shadow-(--preview-shadow)">
      <nav className="flex w-9 shrink-0 flex-col items-center border-r border-border py-2">
        <Wordmark className="size-4 text-ink-900" />
        <div className="mt-3 flex flex-col gap-1">
          {rail.map(({ Icon, active }, index) => (
            <span
              key={index}
              className={cn(
                "grid size-7 place-items-center rounded-md",
                active ? "bg-ink-100 text-ink-900" : "text-ink-400",
              )}
            >
              <Icon className="size-3.5" />
            </span>
          ))}
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

        <div className="flex-1 p-1.5">
          {tree.map((node) => (
            <div
              key={node.label}
              style={{ paddingLeft: `${6 + (node.depth ?? 0) * 12}px` }}
              className={cn(
                "flex h-[22px] items-center gap-1.5 rounded-md pr-1.5 text-[11px]",
                node.active ? "bg-ink-100 font-medium text-ink-900" : "text-ink-500",
              )}
            >
              {node.kind === "folder" ? (
                <>
                  <span aria-hidden className="w-2 text-[8px] text-ink-400">
                    {node.open ? "⌄" : "›"}
                  </span>
                  <Folder className="size-3 text-ink-400" />
                </>
              ) : null}
              <span className="truncate">{node.label}</span>
              {node.kind === "folder" ? (
                <span className="ml-auto font-mono text-[10px] text-ink-400 tabular-nums">
                  {node.count}
                </span>
              ) : null}
            </div>
          ))}
        </div>

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
            {calendar.map((cell, index) => (
              <span
                key={index}
                className={cn(
                  "tabular-nums",
                  cell.muted && "text-ink-300",
                  cell.today && "font-semibold text-ink-900",
                )}
              >
                {cell.date}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center gap-2 border-b border-border px-2 text-ink-400">
          <Panel className="size-3.5" />
          <ChevronLeft className="size-3.5" />
          <ChevronRight className="size-3.5" />
          <span className="flex-1 truncate text-center text-[11.5px] text-ink-900">
            Local-first, actually
          </span>
          <Search className="size-3.5" />
          <PanelRight className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1 px-7 py-4">
          <div className="flex items-center justify-between text-[10px] text-ink-400">
            <span className="flex items-center gap-1">
              <span aria-hidden className="text-[8px]">›</span>
              Properties <span className="text-ink-300">(3)</span>
            </span>
            <span className="caps text-[0.58rem]">add cover</span>
          </div>

          <p className="mt-4 text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink-900">
            Local-first, actually
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Chip sigil="#">local-first</Chip>
            <Chip sigil="#">architecture</Chip>
            <Chip sigil="$">Martin Kleppmann</Chip>
          </div>

          <div className="mt-3 space-y-2 text-[11.5px] leading-[1.7] text-ink-700">
            <p>
              The test is not whether an app caches. It is whether the interface{" "}
              <span className="font-medium text-ink-900">
                ever waits on something it does not own
              </span>
              .
            </p>
            <p className="border-l-2 border-ink-200 pl-3 text-ink-500 italic">
              Every keystroke paints in the same frame, or it is a bug.
            </p>
            <p>
              See <Chip sigil="@">The 8 ms budget</Chip> for the measured version of this claim
              and the benchmark that enforces it.
              <span
                aria-hidden
                className="vg-caret ml-px inline-block h-3 w-px translate-y-0.5 bg-clay-500"
              />
            </p>
            <ul className="space-y-1 pt-0.5">
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="grid size-3 place-items-center rounded-[3px] bg-ink-800 text-[8px] text-surface"
                >
                  ✓
                </span>
                <span className="text-ink-400 line-through">Measure the tree at 5,000 nodes</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="vg-check-box grid size-3 place-items-center rounded-[3px] border border-ink-300 text-[8px] text-surface"
                >
                  <span className="vg-check-mark">✓</span>
                </span>
                <span className="vg-check-text">Write up the sync trade-off</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <aside className="hidden w-[180px] shrink-0 flex-col border-l border-border text-[10.5px] md:flex">
        <div className="relative border-b border-border py-2 pr-2 pl-4">
          <span aria-hidden className="absolute top-3 bottom-3 left-2 w-px bg-ink-300" />
          {outline.map((item, index) => (
            <p
              key={item}
              className={cn(
                "relative truncate py-0.5",
                index === 0 ? "text-ink-900" : "pl-3 text-ink-500",
              )}
            >
              {index === 0 ? (
                <span
                  aria-hidden
                  className="absolute top-1/2 -left-[9px] size-1.5 -translate-y-1/2 rounded-full bg-ink-900"
                />
              ) : null}
              {item}
            </p>
          ))}
        </div>

        <div className="space-y-3 border-b border-border p-2.5">
          <div>
            <SectionLabel count={1}>Referenced by</SectionLabel>
            <p className="mt-1 pl-1 text-ink-700">Launch checklist</p>
          </div>
          <div>
            <SectionLabel count={3}>Links to</SectionLabel>
            <div className="mt-1 space-y-0.5 pl-1 text-ink-700">
              {linksTo.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="border-b border-border p-2.5">
          <p className="caps text-[0.55rem] text-ink-400">local graph</p>
          <svg viewBox="0 0 160 90" aria-hidden className="mt-1 w-full text-ink-400">
            <g stroke="currentColor" strokeWidth="1">
              <line x1="80" y1="45" x2="80" y2="14" />
              <line x1="80" y1="45" x2="34" y2="72" />
              <line x1="80" y1="45" x2="126" y2="72" />
            </g>
            <circle cx="80" cy="45" r="11" className="fill-ink-800" />
            <text x="80" y="49" textAnchor="middle" className="fill-surface text-[9px] font-semibold">
              L
            </text>
            {[
              [80, 14, "8"],
              [34, 72, "L"],
              [126, 72, "W"],
            ].map(([x, y, letter]) => (
              <g key={`${x}-${y}`}>
                <circle cx={x} cy={y} r="8" className="fill-ink-100 stroke-ink-300" />
                <text
                  x={x}
                  y={Number(y) + 3}
                  textAnchor="middle"
                  className="fill-ink-700 text-[8px] font-semibold"
                >
                  {letter}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <dl className="mt-auto space-y-1 p-2.5">
          {stats.map((stat) => (
            <div key={stat.key} className="flex justify-between gap-2">
              <dt className="text-ink-400">{stat.key}</dt>
              <dd className="m-0 text-ink-700 tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
