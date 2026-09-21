import { Search } from "@/components/ui/icons";

const tree = [
  { label: "Pinned", kind: "section" as const },
  { label: "Reading notes", kind: "note" as const, depth: 1 },
  { label: "Workspace", kind: "section" as const },
  { label: "Writing", kind: "folder" as const, depth: 1, open: true },
  { label: "Local-first, actually", kind: "note" as const, depth: 2, active: true },
  { label: "Draft: release post", kind: "note" as const, depth: 2 },
  { label: "Research", kind: "folder" as const, depth: 1 },
  { label: "Journal", kind: "section" as const },
  { label: "Today", kind: "note" as const, depth: 1 },
];

const outline = [
  "What local-first means",
  "The 8 ms budget",
  "Where the data lives",
  "Sync, opt-in",
];

const properties = [
  { key: "Updated", value: "2 min ago" },
  { key: "Words", value: "846" },
  { key: "Versions", value: "23" },
];

function Chip({ sigil, label }: { sigil: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-ink-100 px-1 py-px text-[11px] text-ink-700 transition-colors duration-150 hover:bg-clay-100 hover:text-clay-500">
      <span className="text-ink-400">{sigil}</span>
      {label}
    </span>
  );
}

export function HeroAppPreview() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-surface shadow-(--preview-shadow)">
      <div className="flex items-center gap-4 border-b border-border px-3 py-2">
        <div className="flex shrink-0 items-center gap-1.5">
          <svg viewBox="0 0 24 24" aria-hidden className="size-4 text-clay-500">
            <g
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            >
              <path d="M4 20c1.8-.4 3.2-1.3 4.4-2.6L18.6 6.4a2 2 0 0 0-2.9-2.8L5.5 14.8C4.3 16 3.6 17.5 3.2 19.2Z" />
            </g>
          </svg>
          <span className="text-[13px] font-semibold tracking-[-0.01em]">Skriuw</span>
        </div>

        <div className="flex items-center gap-3 text-[12px]">
          <span className="border-b border-clay-500 pb-1 font-medium text-clay-500">
            Local-first, actually
          </span>
          <span className="text-ink-500">Draft: release post</span>
          <span className="text-ink-400">+</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 sm:flex">
            <Search className="size-3 text-ink-400" />
            <span className="text-[11px] text-ink-400">Search every note</span>
            <span className="ml-6 rounded border border-border px-1 text-[12px] text-ink-400">
              ⌘K
            </span>
          </div>
          <span className="rounded-md border border-border px-1.5 py-1 font-mono text-[11px] text-ink-700">
            .md
          </span>
        </div>
      </div>

      <div className="flex">
        <aside className="hidden w-[168px] shrink-0 border-r border-border p-2 sm:block">
          {tree.map((node) =>
            node.kind === "section" ? (
              <p
                key={node.label}
                className="mt-2 px-1.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase first:mt-0"
              >
                {node.label}
              </p>
            ) : (
              <div
                key={node.label}
                style={{ paddingLeft: `${(node.depth ?? 1) * 8}px` }}
                className={
                  node.active
                    ? "flex items-center gap-1.5 rounded bg-ink-100 px-1.5 py-1 text-[11px] font-medium text-ink-900"
                    : "flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-ink-500 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900"
                }
              >
                <span
                  aria-hidden
                  className={
                    node.kind === "folder"
                      ? "size-2 rounded-[2px] bg-ink-300"
                      : "size-2 rounded-full border border-ink-300"
                  }
                />
                <span className="truncate">{node.label}</span>
              </div>
            ),
          )}
        </aside>

        <div className="min-w-0 flex-1 p-6">
          <p className="text-[11px] text-ink-400">Writing / Local-first, actually</p>
          <p className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">Local-first, actually</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip sigil="#" label="local-first" />
            <Chip sigil="#" label="architecture" />
            <Chip sigil="$" label="Martin Kleppmann" />
          </div>

          <div className="mt-4 space-y-2 text-[11.5px] leading-[1.7] text-ink-700">
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
              See <Chip sigil="@" label="The 8 ms budget" /> for the measured version of this claim
              and the benchmark that enforces it.
              <span
                aria-hidden
                className="vg-caret ml-px inline-block h-3 w-px translate-y-0.5 bg-clay-500"
              />
            </p>
            <div className="rounded-md border border-border bg-ink-50 p-2 font-mono text-[10.5px] leading-[1.6] text-ink-500">
              <span className="text-clay-500">switching notes</span> · typical 3.1 ms · worst 7.4 ms
              <br />
              <span className="text-clay-500">typing a letter</span> · typical 2.8 ms · 0 dropped
              frames
            </div>
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

        <aside className="hidden w-[132px] shrink-0 border-l border-border p-3 lg:block">
          <p className="text-[11px] text-ink-400">Outline</p>
          <div className="mt-1.5 space-y-1">
            {outline.map((item, index) => (
              <p
                key={item}
                className={index === 1 ? "text-[11px] text-ink-900" : "text-[11px] text-ink-400"}
              >
                {item}
              </p>
            ))}
          </div>

          <p className="mt-4 text-[11px] text-ink-400">Properties</p>
          <div className="mt-1.5 space-y-1">
            {properties.map((property) => (
              <p key={property.key} className="flex justify-between gap-2 text-[11px]">
                <span className="text-ink-400">{property.key}</span>
                <span className="text-ink-700">{property.value}</span>
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
