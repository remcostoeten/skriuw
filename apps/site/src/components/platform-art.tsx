import type { CSSProperties } from "react";
import { cn } from "@skriuw/shared/helpers/cn";
import { Android, Apple, Globe, Linux, Pwa, Windows } from "@/components/ui/icons";

function index(value: number) {
  return { "--i": value } as CSSProperties;
}

const hubTargets = [
  {
    label: "macOS",
    icon: <Apple className="size-4" />,
    left: "14.71%",
    top: "16.67%",
    path: "M138 120 C100 120 110 40 50 40",
  },
  {
    label: "Windows",
    icon: <Windows className="size-4" />,
    left: "14.71%",
    top: "50%",
    path: "M138 120 L50 120",
  },
  {
    label: "Linux",
    icon: <Linux className="size-4" />,
    left: "14.71%",
    top: "83.33%",
    path: "M138 120 C100 120 110 200 50 200",
  },
  {
    label: "Browser",
    icon: <Globe className="size-4" />,
    left: "50%",
    top: "14.58%",
    path: "M170 88 L170 35",
  },
  {
    label: "PWA",
    icon: <Pwa className="size-4" />,
    left: "50%",
    top: "85.42%",
    path: "M170 152 L170 205",
  },
  {
    label: "iOS",
    icon: <Apple className="size-4" />,
    left: "85.29%",
    top: "29.17%",
    path: "M202 120 C240 120 230 70 290 70",
    pending: true,
  },
  {
    label: "Android",
    icon: <Android className="size-4" />,
    left: "85.29%",
    top: "70.83%",
    path: "M202 120 C240 120 230 170 290 170",
    pending: true,
  },
];

export function DesktopArt() {
  return (
    <div className="relative aspect-[340/240] w-full max-w-[340px] text-[12px]">
      <svg viewBox="0 0 340 240" fill="none" className="absolute inset-0 size-full">
        {hubTargets.map((target, position) => (
          <g key={target.label} stroke="currentColor" strokeLinecap="round">
            <path d={target.path} strokeOpacity={0.2} />
            <path
              d={target.path}
              pathLength={1}
              strokeWidth={1.5}
              style={index(position)}
              className="pa-flow"
            />
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
          title={target.pending ? "In the works" : undefined}
          className={cn(
            "absolute grid size-10 -translate-1/2 place-items-center rounded-[10px] border border-current/15 bg-black/10 backdrop-blur-[2px]",
            target.pending && "border-dashed opacity-60",
          )}
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
