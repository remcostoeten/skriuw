"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { noop } from "@skriuw/shared/helpers/noop";
import { Apple, Download, Linux, Windows } from "@/components/ui/icons";
import { allPlatformsHref, desktopOrder, desktopPlatforms, detectOs } from "@/data/downloads";
import type { DesktopOs, DetectedOs } from "@/data/downloads";

const marks: Record<DetectedOs, (props: { className?: string }) => ReactNode> = {
  macos: Apple,
  windows: Windows,
  linux: Linux,
  unknown: Download,
};

const options: DetectedOs[] = ["unknown", ...desktopOrder];

function subscribe() {
  return noop;
}

function readOs() {
  return detectOs(navigator.userAgent, navigator.maxTouchPoints);
}

function readServerOs(): DetectedOs {
  return "unknown";
}

export function useDetectedOs() {
  return useSyncExternalStore(subscribe, readOs, readServerOs);
}

function optionLabel(os: DetectedOs, fallback: string) {
  return os === "unknown" ? fallback : desktopPlatforms[os].label;
}

type Props = {
  className?: string;
  fallbackLabel?: string;
  fallbackHref?: string;
};

export function DownloadButton({
  className,
  fallbackLabel = "Download the app",
  fallbackHref = allPlatformsHref,
}: Props) {
  const os = useDetectedOs();
  const href = os === "unknown" ? fallbackHref : desktopPlatforms[os].href;
  return (
    <Link href={href} data-os={os} className={className}>
      {/* Every label shares one grid cell so swapping in the detected OS never changes the width. */}
      <span className="grid">
        {options.map((option) => {
          const Mark = marks[option];
          return (
            <span
              key={option}
              aria-hidden={option !== os}
              className={cn(
                "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
                option !== os && "invisible",
              )}
            >
              <Mark className="size-3.5 shrink-0" />
              {optionLabel(option, fallbackLabel)}
            </span>
          );
        })}
      </span>
    </Link>
  );
}

export function DetectedMark({ os }: { os: DesktopOs }) {
  const detected = useDetectedOs();
  return (
    <span
      aria-hidden={detected !== os}
      className={cn(
        "rounded-full bg-accent/12 px-1.5 py-px text-[0.6rem] text-accent",
        detected !== os && "invisible",
      )}
    >
      your system
    </span>
  );
}
