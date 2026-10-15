import type { ReactNode } from "react";
import { cn } from "@skriuw/shared/helpers/cn";
import { Check, FolderOpen, Lock, Pwa } from "@/components/ui/icons";
import { Panel, vars } from "@/components/home/vignette-panel";

const note = {
  title: "Trip to Lisbon",
  file: "lisbon.md",
  folder: "Trips",
  siblings: ["porto.md", "madeira.md"],
};

const sourceLines = [
  "# Trip to Lisbon",
  "",
  "Flights booked for **12 May**.",
  "",
  "- [x] book the apartment",
  "- [ ] look up the tram museum",
];

function NoteBody({ className }: { className?: string }) {
  return (
    <div className={cn("p-4", className)}>
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">{note.title}</p>
      <p className="mt-2 text-[12.5px] leading-5 text-ink-500">
        Flights booked for <span className="font-semibold text-ink-900">12 May</span>.
      </p>
      <p className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-400">
        <span className="grid size-3.5 place-items-center rounded-[3px] bg-clay-500 text-surface">
          <Check className="size-2.5" />
        </span>
        <span className="line-through">book the apartment</span>
      </p>
      <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-ink-500">
        <span className="grid size-3.5 shrink-0 place-items-center rounded-[3px] border border-ink-300" />
        <span className="inline-flex items-center gap-1">
          look up the tram museum
          <span className="vg-caret h-3.5 w-[1.5px] bg-clay-500" />
        </span>
      </p>
    </div>
  );
}

function Bar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 items-center gap-2 border-b border-border px-3 font-mono text-[10px] text-ink-400",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DesktopVignette() {
  return (
    <Panel>
      <Bar>
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-ink-300" />
          <span className="size-2 rounded-full bg-ink-300" />
          <span className="size-2 rounded-full bg-ink-300" />
        </span>
        <span className="flex-1 truncate text-center">
          {note.title} · {note.folder}
        </span>
        <span className="w-9" aria-hidden />
      </Bar>
      <div className="grid sm:grid-cols-[92px_minmax(0,1fr)]">
        <ul className="hidden border-r border-border py-2.5 pr-2 pl-2.5 font-mono text-[10px] text-ink-500 sm:block">
          <li className="flex items-center gap-1.5 px-1.5 py-1 text-ink-700">
            <FolderOpen className="size-3" />
            {note.folder}
          </li>
          <li className="ml-2 rounded bg-ink-900/8 px-1.5 py-1 text-ink-900">{note.file}</li>
          {note.siblings.map((sibling) => (
            <li key={sibling} className="ml-2 px-1.5 py-1">
              {sibling}
            </li>
          ))}
        </ul>
        <NoteBody />
      </div>
    </Panel>
  );
}

export function BrowserVignette() {
  return (
    <Panel>
      <Bar className="items-end gap-1 border-b-0 px-2 pb-0">
        <span className="flex items-center gap-1.5 rounded-t-[6px] border border-b-0 border-border bg-hy-card px-2.5 py-1.5 text-ink-900">
          <span className="size-1.5 rounded-full bg-accent" />
          Skriuw
        </span>
        <span className="px-2 pb-1.5" aria-hidden>
          +
        </span>
      </Bar>
      <Bar className="border-t border-border bg-hy-card">
        <Lock className="size-2.5" />
        <span className="text-ink-700">skriuw.com/app</span>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-ink-900/8 px-1.5 py-0.5 text-[9px] text-ink-500">
          <Pwa className="size-2.5" />
          Install
        </span>
      </Bar>
      <NoteBody />
    </Panel>
  );
}

export function FilesVignette() {
  return (
    <Panel>
      <Bar>
        <FolderOpen className="size-3" />
        <span className="text-ink-700">~/Notes/{note.folder}</span>
        <span className="ml-auto">{note.siblings.length + 1} files</span>
      </Bar>
      <ul className="flex gap-1.5 border-b border-border px-3 py-2 font-mono text-[10px] text-ink-500">
        <li className="rounded bg-ink-900/8 px-1.5 py-0.5 text-ink-900">{note.file}</li>
        {note.siblings.map((sibling) => (
          <li key={sibling} className="px-1.5 py-0.5">
            {sibling}
          </li>
        ))}
      </ul>
      <pre className="px-3 py-3 font-mono text-[11px] leading-[19px] text-ink-700">
        {sourceLines.map((line, index) => (
          <div key={index} className="flex gap-3">
            <span className="w-3 shrink-0 text-right text-ink-300">{index + 1}</span>
            <span className={cn(/^[#-]/.test(line) && "text-clay-500")}>{line || " "}</span>
          </div>
        ))}
      </pre>
      <p className="flex items-center gap-2 border-t border-border px-3 py-2.5 font-mono text-[10px] text-ink-400">
        <span
          style={vars({ "--ping": "var(--ok)" })}
          className="vg-ping size-1.5 rounded-full bg-ok"
        />
        Backup 14:00 · verified
      </p>
    </Panel>
  );
}
