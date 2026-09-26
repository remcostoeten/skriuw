"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { Android, Apple, Download, Globe, Linux, Windows } from "@/components/ui/icons";
import { HybridAppPreview } from "@/components/hybrid/app-preview";
import { appUrl, releasesUrl } from "@/data/content";
import { outlineButton, primaryButton } from "@/components/hybrid/control";

const inTheWorks = "In the works";

const platforms = [
  { name: "macOS", Mark: Apple },
  { name: "Windows", Mark: Windows },
  { name: "Linux", Mark: Linux },
  { name: "Browser", Mark: Globe },
];

type Props = {
  badge: ReactNode;
};

export function HybridHero({ badge }: Props) {
  return (
    <section className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12 lg:items-center">
      <div className="max-w-[480px]">
        {badge}

        <h1 className="mt-6 font-serif text-[52px] leading-[50px] font-normal tracking-[-1.8px] text-balance text-ink-900">
          Notes that never make you wait
        </h1>

        <p className="mt-6 text-[17px] leading-[26px] text-ink-500">
          Notes and a journal that live on your own device. Nothing to sign up for, and nothing to
          wait for.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Link
            href={appUrl}
            className={cn(primaryButton, "bg-ink-800 hover:bg-accent focus-visible:bg-accent")}
          >
            Open in your browser
          </Link>
          <Link
            href={releasesUrl}
            className={cn(
              outlineButton,
              "h-10 bg-transparent px-4 text-ink-700 hover:bg-ink-900/7",
            )}
          >
            <Download className="size-3.5" />
            Download the app
          </Link>
        </div>

        <ul className="caps mt-8 flex flex-wrap items-center gap-1.5 text-ink-500">
          {platforms.map(({ name, Mark }) => (
            <li
              key={name}
              className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-hy-card px-2"
            >
              <Mark className="size-3" />
              {name}
            </li>
          ))}
          <Tooltip label={inTheWorks}>
            <li
              tabIndex={0}
              className="inline-flex h-6 cursor-help items-center gap-1.5 rounded-md border border-dashed border-line bg-hy-card px-2 text-ink-400 outline-none focus-visible:border-solid focus-visible:border-ink-400"
            >
              <Apple className="size-3" />
              <Android className="size-3" />
              Mobile
              <span aria-hidden className="-ml-1 text-accent">
                *
              </span>
            </li>
          </Tooltip>
        </ul>
      </div>

      <div className="relative z-10 lg:w-[calc(100%+160px)]">
        <p className="caps absolute -top-3 left-4 z-10 rounded-full border border-line bg-hy-bg px-2 py-0.5 text-[0.62rem] text-ink-500">
          app · live preview
        </p>
        <div className="rounded-[10px] border border-dashed border-line p-2">
          <HybridAppPreview />
        </div>
      </div>
    </section>
  );
}
