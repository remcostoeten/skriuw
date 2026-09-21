import type { CSSProperties, ReactNode } from "react";
import { Apple, Check, Globe, Linux, Lock, Windows } from "@/components/ui/icons";

type FrameProps = {
  title: ReactNode;
  children: ReactNode;
};

function index(value: number) {
  return { "--i": value } as CSSProperties;
}

function Frame({ title, children }: FrameProps) {
  return (
    <div className="w-full max-w-[340px] overflow-hidden rounded-[10px] border border-current/15 bg-black/10 text-[12px] backdrop-blur-[2px]">
      <div className="flex items-center gap-2 border-b border-current/10 px-3 py-2">
        <span className="flex gap-1">
          <span className="size-1.5 rounded-full bg-current opacity-30" />
          <span className="size-1.5 rounded-full bg-current opacity-30" />
          <span className="size-1.5 rounded-full bg-current opacity-30" />
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] opacity-70">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

const hubTargets = [
  { label: "macOS", icon: <Apple className="size-4" />, left: "11.76%", top: "18.18%", path: "M138 110 C100 110 110 40 60 40" },
  { label: "Windows", icon: <Windows className="size-4" />, left: "88.24%", top: "18.18%", path: "M202 110 C240 110 230 40 280 40" },
  { label: "Linux", icon: <Linux className="size-4" />, left: "11.76%", top: "81.82%", path: "M138 110 C100 110 110 180 60 180" },
  { label: "Browser", icon: <Globe className="size-4" />, left: "88.24%", top: "81.82%", path: "M202 110 C240 110 230 180 280 180" },
];

export function DesktopArt() {
  return (
    <div className="relative aspect-[340/220] w-full max-w-[340px] text-[12px]">
      <svg viewBox="0 0 340 220" fill="none" className="absolute inset-0 size-full">
        {hubTargets.map((target, position) => (
          <g key={target.label} stroke="currentColor" strokeLinecap="round">
            <path d={target.path} strokeOpacity={0.2} />
            <path d={target.path} pathLength={1} strokeWidth={1.5} style={index(position)} className="pa-flow" />
          </g>
        ))}
      </svg>

      <div className="absolute top-1/2 left-1/2 grid size-16 -translate-1/2 place-items-center rounded-[12px] border border-current/20 bg-black/15 backdrop-blur-[2px]">
        <span className="flex flex-col items-center gap-1 font-mono text-[11px]">
          <span className="pa-pulse size-1.5 rounded-full bg-current" />
          core
          <span className="text-[9px] opacity-60">rust</span>
        </span>
      </div>

      {hubTargets.map((target) => (
        <div
          key={target.label}
          style={{ left: target.left, top: target.top }}
          className="absolute grid size-10 -translate-1/2 place-items-center rounded-[10px] border border-current/15 bg-black/10 backdrop-blur-[2px]"
        >
          {target.icon}
          <span className="absolute top-full mt-1 font-mono text-[9px] whitespace-nowrap opacity-60">
            {target.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BrowserArt() {
  return (
    <Frame
      title={
        <>
          <Lock className="size-3 shrink-0" />
          <span className="truncate">skriuw.com/app</span>
        </>
      }
    >
      <div className="space-y-3 px-3 py-3.5">
        <div className="flex items-center justify-between">
          <span className="font-mono">skriuw_core.wasm</span>
          <span className="font-mono opacity-60">ready</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-current/15">
          <span className="pa-load block h-full origin-left rounded-full bg-current opacity-70" />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-current/10 px-3 py-2.5">
        <span className="opacity-80">Sent to a server</span>
        <span className="font-mono">0 B</span>
      </div>
    </Frame>
  );
}

const backups = ["00:00", "06:00", "12:00", "18:00"];

export function DataArt() {
  return (
    <Frame title="backups/">
      <ul>
        {backups.map((time, position) => (
          <li
            key={time}
            className="flex items-center gap-2 border-b border-current/10 px-3 py-2.5"
          >
            <span className="font-mono">{time}</span>
            <span className="opacity-60">archive</span>
            <span
              style={index(position)}
              className="pa-verify ml-auto flex items-center gap-1 opacity-80"
            >
              <Check className="size-3" />
              verified
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="opacity-80">Export</span>
        <span className="font-mono">1,284 × .md</span>
      </div>
    </Frame>
  );
}
