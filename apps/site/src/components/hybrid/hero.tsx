"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { Apple, ArrowRight, Download, Globe, Linux, Windows } from "@/components/ui/icons";
import { HybridAppPreview } from "@/components/hybrid/app-preview";
import { appUrl, releasesUrl } from "@/data/content";
import { outlineButton, primaryButton } from "@/components/hybrid/control";

const platforms = [
  { name: "macOS", Mark: Apple },
  { name: "Windows", Mark: Windows },
  { name: "Linux", Mark: Linux },
  { name: "Browser", Mark: Globe },
];

function useLatency() {
  const [value, setValue] = useState(3.2);

  useEffect(() => {
    const id = setInterval(() => {
      setValue(() => 2.4 + Math.random() * 1.6);
    }, 900);

    return () => {
      clearInterval(id);
    };
  }, []);

  return value.toFixed(1);
}

export function HybridHero() {
  const latency = useLatency();

  return (
    <section className="grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-14 lg:items-center">
      <div className="max-w-[440px]">
        <Link
          href="/#speed"
          className="hy-link inline-flex items-center gap-2 rounded-full border border-line bg-hy-card py-1 pr-2 pl-3 text-xs font-medium text-ink-500 no-underline transition-colors hover:border-ink-400 hover:text-ink-900"
        >
          <span>Keystroke to paint</span>
          <span className="rounded-full bg-ink-900/8 px-2 py-0.5 font-mono text-xs font-medium text-ink-700 tabular-nums">
            {latency} ms
          </span>
          <ArrowRight className="size-3" />
        </Link>

        <h1 className="mt-6 font-serif text-[44px] leading-[48px] font-normal tracking-[-1.5px] text-balance text-ink-900">
          Notes that never make you wait
        </h1>

        <p className="mt-5 text-[16px] leading-[24px] text-ink-500">
          Notes and a journal that live on your own device. Nothing to sign up for, and nothing
          to wait for.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Link href={appUrl} className={primaryButton}>
            Open in your browser
          </Link>
          <Link href={releasesUrl} className={cn(outlineButton, "h-10 px-4")}>
            <Download className="size-3.5" />
            Download the app
          </Link>
        </div>

        <ul className="caps mt-8 flex flex-wrap items-center gap-1.5 text-ink-500">
          <li className="mr-1">Runs offline on</li>
          {platforms.map(({ name, Mark }) => (
            <li
              key={name}
              className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-hy-card px-2"
            >
              <Mark className="size-3" />
              {name}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative z-10 lg:w-[820px]">
        <p className="caps absolute -top-3 left-4 z-10 rounded-full border border-line bg-hy-bg px-2 py-0.5 text-[0.62rem] text-ink-500">
          app · live preview
        </p>
        <div className="animate-hy-enter rounded-[10px] border border-dashed border-line p-2">
          <HybridAppPreview />
        </div>
      </div>
    </section>
  );
}
