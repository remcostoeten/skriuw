import type { CSSProperties, ReactNode } from "react";
import { Check, Lock, Search } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

type PanelProps = {
  children: ReactNode;
  className?: string;
};

function vars(values: Record<string, string | number>) {
  return values as CSSProperties;
}

function Panel({ children, className }: PanelProps) {
  return (
    <div
      className={cx(
        "vg-panel h-full w-full rounded-tl-[10px] border-t border-l border-border bg-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

type SigilProps = {
  sigil: string;
  label: string;
};

function Sigil({ sigil, label }: SigilProps) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-clay-100 px-1 py-px text-clay-500">
      <span className="opacity-60">{sigil}</span>
      {label}
    </span>
  );
}

const lineStep = 1.2;

const sourceLines = [
  { text: "## The 8 ms budget", tone: "syntax", slot: 0 },
  { text: "", tone: "plain" },
  { text: "Every keystroke paints in the **same frame**.", tone: "plain", slot: 1 },
  { text: "- measured on a production build", tone: "syntax", slot: 2 },
  { text: "- [x] tree at 5,000 nodes", tone: "syntax", slot: 3 },
];

const tones: Record<string, string> = {
  syntax: "text-clay-500",
  plain: "text-ink-700",
};

function slotDelay(slot: number) {
  return vars({ "--delay": `${slot * lineStep}s` });
}

export function EditorVignette() {
  return (
    <Panel className="grid md:grid-cols-[1fr_1.15fr]">
      <div className="p-5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase">Rich text</p>
        <div className="mt-4 space-y-2.5">
          <p
            style={slotDelay(0)}
            className="vg-appear text-[17px] font-semibold tracking-[-0.01em] text-ink-900"
          >
            The 8 ms budget
          </p>
          <p style={slotDelay(1)} className="vg-appear text-[13px] leading-5 text-ink-500">
            Every keystroke paints in the{" "}
            <span className="font-semibold text-ink-900">same frame</span>.
          </p>
          <p
            style={slotDelay(2)}
            className="vg-appear flex items-center gap-2 text-[13px] text-ink-500"
          >
            <span aria-hidden className="size-1 rounded-full bg-ink-400" />
            measured on a production build
          </p>
          <p
            style={slotDelay(3)}
            className="vg-appear flex items-center gap-2 text-[13px] text-ink-400"
          >
            <span className="grid size-3.5 place-items-center rounded-[3px] bg-clay-500 text-surface">
              <Check className="size-2.5" />
            </span>
            <span className="line-through">tree at 5,000 nodes</span>
          </p>
        </div>
      </div>

      <div className="border-t border-border p-5 md:border-t-0 md:border-l">
        <p className="flex justify-between font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase">
          Raw Markdown
          <span className="normal-case">budget.md</span>
        </p>
        <pre className="mt-4 overflow-hidden pb-5 font-mono text-[12px] leading-[22px]">
          {sourceLines.map((line, index) => (
            <div key={index} className="flex gap-3">
              <span className="w-3 shrink-0 text-right text-ink-300">{index + 1}</span>
              {line.slot !== undefined ? (
                <span className="flex items-center">
                  <span
                    style={vars({
                      "--chars": line.text.length,
                      "--delay": `${line.slot * lineStep}s`,
                    })}
                    className={cx("vg-typed", tones[line.tone])}
                  >
                    {line.text}
                  </span>
                  <span
                    style={slotDelay(line.slot)}
                    className="vg-type-caret h-3.5 w-[1.5px] bg-clay-500"
                  />
                </span>
              ) : (
                <span> </span>
              )}
            </div>
          ))}
        </pre>
      </div>
    </Panel>
  );
}

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
const days = Array.from({ length: 21 }, (_, index) => index + 1);
const written = new Set([1, 2, 4, 5, 8, 9, 10, 12, 15, 16, 17, 18]);
const today = 20;

export function JournalVignette() {
  return (
    <Panel className="p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink-900">September</span>
        <span className="font-mono text-[10px] text-ink-400">15 entries</span>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {weekdays.map((day, index) => (
          <span key={index} className="font-mono text-[9px] text-ink-400">
            {day}
          </span>
        ))}
        {days.map((day) => (
          <span
            key={day}
            style={vars({ "--i": day })}
            className={cx(
              "grid h-7 place-items-center rounded-[3px] font-mono text-[10px]",
              day === today
                ? "bg-ink-800 text-surface"
                : written.has(day)
                  ? "vg-pop bg-clay-100 text-clay-500"
                  : "text-ink-400",
            )}
          >
            {day}
          </span>
        ))}
      </div>

      <div className="mt-4 border-t border-border pt-3 pb-5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase">
          A year ago today
        </p>
        <p className="mt-1.5 font-serif text-[14px] leading-5 text-ink-700 italic">
          “Deleted the sync spinner. Nothing replaced it.”
        </p>
      </div>
    </Panel>
  );
}

const references = [
  { title: "Journal · 12 Sep", snippet: "rewrote the sync section after the call with" },
  { title: "Reading notes", snippet: "the seven ideals, as laid out by" },
  { title: "Draft: release post", snippet: "credit for the framing goes to" },
];

export function LinksVignette() {
  return (
    <Panel>
      <p className="p-5 pb-4 text-[13px] leading-6 text-ink-700">
        Call with <Sigil sigil="$" label="Martin Kleppmann" /> about{" "}
        <Sigil sigil="#" label="local-first" />, see <Sigil sigil="@" label="The 8 ms budget" />.
      </p>

      <p className="border-t border-border px-5 pt-3 font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase">
        3 notes mention $Martin Kleppmann
      </p>
      <ul className="px-5 pt-1 pb-3">
        {references.map((reference, index) => (
          <li
            key={reference.title}
            style={vars({ "--i": index })}
            className="vg-sweep -mx-2 rounded px-2 py-1.5"
          >
            <p className="text-[12px] font-medium text-ink-900">{reference.title}</p>
            <p className="truncate text-[11.5px] text-ink-500">
              …{reference.snippet} <span className="text-clay-500">$Martin Kleppmann</span>
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const revisions = [
  { time: "2 min ago", plus: 42, minus: 3, dot: "vg-ping vg-scrub-from bg-clay-500" },
  { time: "1 h ago", plus: 118, minus: 27, dot: "bg-ink-300" },
  { time: "Yesterday", plus: 9, minus: 61, dot: "vg-scrub-to bg-ink-300" },
];

const barCount = 23;
const latestBar = barCount - 1;
const scrubbedBar = 15;

function barTone(index: number) {
  if (index === latestBar) {
    return "vg-scrub-from bg-clay-500";
  }

  return index === scrubbedBar ? "vg-scrub-to bg-ink-300" : "bg-ink-300";
}

export function HistoryVignette() {
  return (
    <Panel className="p-5 pb-0">
      <div className="flex items-end gap-[3px]">
        {Array.from({ length: barCount }, (_, index) => (
          <span
            key={index}
            style={vars({ "--i": index, "--h": 0.3 + ((index * 7) % 10) / 14 })}
            className={cx("vg-bar h-8 flex-1 origin-bottom rounded-[1px]", barTone(index))}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {revisions.map((revision) => (
          <li key={revision.time} className="flex items-center gap-2.5">
            <span className={cx("size-1.5 shrink-0 rounded-full", revision.dot)} />
            <span className="text-[12px] text-ink-900">{revision.time}</span>
            <span className="ml-auto font-mono text-[11px] text-clay-500">+{revision.plus}</span>
            <span className="w-7 text-right font-mono text-[11px] text-ink-400">
              −{revision.minus}
            </span>
          </li>
        ))}
      </ul>

      <pre className="vg-swap -ml-5 mt-4 border-t border-border py-3 pl-5 font-mono text-[11px] leading-5">
        <div>
          <div className="text-ink-400 line-through">− the UI waits for the server</div>
          <div className="text-clay-500">+ the UI never waits on the network</div>
        </div>
        <div>
          <div className="text-ink-400 line-through">− syncing… please wait</div>
          <div className="text-clay-500">+ sync happens out of sight</div>
        </div>
      </pre>
    </Panel>
  );
}

const nodes = [
  { name: "Private", locked: true },
  { name: "Therapy notes", locked: true, child: true },
  { name: "Finances", locked: true, child: true },
  { name: "Reading notes", locked: false },
];

const ciphertexts = ["a9f3 07c1 e2b8 4d60", "5be0 c44a 19f7 d302", "e71c 8a2f 60bd 93c5"];

export function LockVignette() {
  return (
    <Panel>
      <ul className="py-2">
        {nodes.map((node) => (
          <li
            key={node.name}
            style={{ paddingLeft: node.child ? "2.5rem" : "1.25rem" }}
            className="flex items-center gap-2.5 py-1.5 pr-5"
          >
            <span
              className={cx(
                "grid size-5 shrink-0 place-items-center rounded",
                node.locked ? "bg-clay-100 text-clay-500" : "text-ink-400",
              )}
            >
              {node.locked ? <Lock className="size-3" /> : <Check className="size-3" />}
            </span>
            <span className={cx("text-[12.5px]", node.locked ? "text-ink-900" : "text-ink-500")}>
              {node.name}
            </span>
            {node.locked ? (
              <span className="vg-swap ml-auto justify-items-end font-mono text-[10px]">
                <span className="text-ink-400">PIN</span>
                <span className="text-clay-500">unlocked</span>
              </span>
            ) : (
              <span className="ml-auto font-mono text-[10px] text-ink-400">open</span>
            )}
          </li>
        ))}
      </ul>

      <div className="vg-swap border-t border-border px-5 pt-3 pb-5">
        <div>
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase">
            What the server stores
          </p>
          <p className="relative mt-1.5 h-5 font-mono text-[12px] text-ink-700">
            {ciphertexts.map((ciphertext, index) => (
              <span
                key={ciphertext}
                style={vars({ "--i": index })}
                className={cx("vg-cycle absolute inset-0", index > 0 && "opacity-0")}
              >
                {ciphertext} …
              </span>
            ))}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.08em] text-clay-500 uppercase">
            What you read after the PIN
          </p>
          <p className="mt-1.5 h-5 truncate font-serif text-[13px] text-ink-900 italic">
            Session 14: slept better this week.
          </p>
        </div>
      </div>
    </Panel>
  );
}

const commands = [
  { label: "Toggle raw Markdown", hint: "⌘ /", group: "Editor" },
  { label: "Open split view", hint: "⌘ \\", group: "Layout" },
  { label: "Go to date…", hint: "d", group: "Journal" },
  { label: "Lock this folder", hint: "⌘ ⇧ L", group: "Security" },
];

const results = [
  { title: "Local-first, actually", snippet: "…it never waits on something it does not own…" },
  { title: "Journal · 12 Sep", snippet: "…rewrote the sync section, finally readable…" },
];

export function PaletteVignette() {
  return (
    <Panel className="lg:border-t-0 lg:rounded-none">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <Search className="size-3.5 text-ink-400" />
        <span className="flex items-center">
          <span
            style={vars({ "--chars": 4 })}
            className="vg-typed vg-typed-short font-mono text-[13px] text-ink-900"
          >
            mark
          </span>
          <span className="vg-caret h-4 w-[1.5px] bg-clay-500" />
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink-400">esc</span>
      </div>

      <div className="grid sm:grid-cols-2">
        <div className="p-3">
          <p className="px-2 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase">
            Commands
          </p>
          <ul>
            {commands.map((command, index) => (
              <li
                key={command.label}
                style={vars({ "--i": index })}
                className={cx(
                  "vg-sweep flex items-center gap-2 rounded px-2 py-2 text-[12.5px]",
                  index === 0 && "motion-reduce:bg-clay-100",
                )}
              >
                <span className="text-ink-900">{command.label}</span>
                <span className="text-[11px] text-ink-400">{command.group}</span>
                <span className="ml-auto font-mono text-[11px] text-ink-400">{command.hint}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-border p-3 sm:border-t-0 sm:border-l">
          <p className="px-2 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase">
            In your notes · 2 matches
          </p>
          <ul>
            {results.map((result, index) => (
              <li
                key={result.title}
                style={vars({ "--i": index })}
                className="vg-appear-early px-2 py-2"
              >
                <p className="text-[12.5px] font-medium text-ink-900">{result.title}</p>
                <p className="mt-0.5 text-[12px] leading-[18px] text-ink-500">{result.snippet}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
