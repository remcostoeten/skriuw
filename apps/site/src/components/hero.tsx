"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Action, Container, cx } from "@/components/ui/primitives";
import { Apple, ArrowRight, Download, Linux, Windows } from "@/components/ui/icons";
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

function useTypedLatency() {
  const [value, setValue] = useState(3.2);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let id: ReturnType<typeof setInterval> | undefined;

    function sync() {
      clearInterval(id);

      if (media.matches) {
        return;
      }

      id = setInterval(() => {
        setValue(() => 2.4 + Math.random() * 1.6);
      }, 900);
    }

    sync();
    media.addEventListener("change", sync);

    return () => {
      clearInterval(id);
      media.removeEventListener("change", sync);
    };
  }, []);

  return value.toFixed(1);
}

export function Hero() {
  const latency = useTypedLatency();

  return (
    <section id="top" className="relative overflow-x-clip bg-surface">
      <Container className="grid items-center gap-12 pt-16 pb-24 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:pt-24 lg:pb-32">
        <div className="max-w-[402px]">
          <Link
            href="/#speed"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-2 pl-3 text-xs font-medium text-ink-500 transition-colors hover:border-ink-400 focus-visible:bg-focus-tint focus-visible:text-focus-ink"
          >
            <span>Keystroke to paint</span>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 font-mono text-xs font-medium text-ink-700 tabular-nums">
              {latency} ms
            </span>
            <ArrowRight className="size-3" />
          </Link>

          <h1 className="mt-6 font-serif text-[44px] leading-[48px] font-normal tracking-[-1.5px] text-ink-900 text-balance">
            Notes that never make you wait
          </h1>

          <p className="mt-5 text-[16px] leading-[24px] text-ink-500">
            Skriuw is a local-first writing workspace. Your notes live in{" "}
            <strong className="font-medium text-ink-900">a SQLite database on your own device</strong>
            {" "}&mdash; on disk on desktop, inside the browser on the web. No spinners, no
            round-trips, no account.
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
          className={cx(
            "relative lg:-mr-[22vw]",
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
