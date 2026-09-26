"use client";

import type { ReactNode } from "react";
import { cn } from "@skriuw/shared/helpers/cn";
import { Action, Container } from "@/components/ui/primitives";
import { Apple, Download, Linux, Windows } from "@/components/ui/icons";
import { HeroAppPreview } from "@/components/hero-app-preview";
import { appUrl, releasesUrl } from "@/data/content";

const platforms = [
  { name: "macOS", Mark: Apple },
  { name: "Windows", Mark: Windows },
  { name: "Linux", Mark: Linux },
];

function RunsOn() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-400">
      <span>Runs offline on</span>
      <span className="flex items-center gap-1.5">
        {platforms.map(({ name, Mark }) => (
          <span
            key={name}
            title={name}
            className="grid size-6 place-items-center rounded border border-border bg-surface text-ink-500"
          >
            <Mark className="size-3.5" />
          </span>
        ))}
      </span>
      <span>or straight in the browser</span>
      <span className="text-ink-300">&middot;</span>
      <span>cloud sync optional, end-to-end encrypted</span>
    </div>
  );
}

type Props = {
  badge: ReactNode;
};

export function Hero({ badge }: Props) {
  return (
    <section id="top" className="relative overflow-x-clip bg-surface">
      <Container className="grid items-center gap-12 pt-16 pb-24 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:pt-24 lg:pb-32">
        <div className="max-w-[402px]">
          {badge}

          <h1 className="mt-6 font-serif text-[44px] leading-[48px] font-normal tracking-[-1.5px] text-ink-900 text-balance">
            Notes that never make you wait
          </h1>

          <p className="mt-5 text-[16px] leading-[24px] text-ink-500">
            Skriuw is a local-first writing workspace. Your notes live in{" "}
            <strong className="font-medium text-ink-900">
              a SQLite database on your own device
            </strong>{" "}
            &mdash; on disk on desktop, inside the browser on the web. No spinners, no round-trips,
            no account.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Action size="lg" arrow="disc" href={appUrl}>
              Open in your browser
            </Action>
            <Action size="lg" variant="outline" pill href={releasesUrl}>
              <Download className="size-4" />
              Download the app
            </Action>
          </div>

          <RunsOn />
        </div>

        <div
          className={cn(
            "relative lg:-mr-[max(0px,min(22vw,calc((100vw-72rem)/2+0.25rem)))]",
            "transition-[opacity,transform] duration-500 ease-out",
            "starting:translate-y-3 starting:scale-[0.985] starting:opacity-0",
            "motion-reduce:duration-300 motion-reduce:starting:translate-y-0 motion-reduce:starting:scale-100",
          )}
        >
          <HeroAppPreview />
        </div>
      </Container>
    </section>
  );
}
