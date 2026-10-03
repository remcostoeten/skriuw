"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { Android, Apple, Globe, Linux, Windows } from "@/components/ui/icons";
import { AppPreview } from "@/components/home/app-preview";
import { DownloadButton } from "@/components/download/download-button";
import { appUrl } from "@/data/content";
import { allPlatformsHref, desktopOrder, desktopPlatforms } from "@/data/downloads";
import { outlineButton, primaryButton } from "@/components/frame/control";

const inTheWorks = "In the works";

const desktopMarks = { macos: Apple, windows: Windows, linux: Linux };

const platforms = [
  ...desktopOrder.map((os) => ({
    name: desktopPlatforms[os].name,
    href: `${allPlatformsHref}#${os}`,
    Mark: desktopMarks[os],
  })),
  { name: "Web", href: appUrl, Mark: Globe },
];

const chip = "inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-hy-card px-2";

type Props = {
  badge: ReactNode;
};

function heroDelay(step: number): CSSProperties {
  return { "--hero-delay": `${step * 70}ms` } as CSSProperties;
}

export function HomeHero({ badge }: Props) {
  return (
    <section className="grid gap-12">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
        <div className="min-w-0">
          <div className="hy-hero-in" style={heroDelay(0)}>
            {badge}
          </div>

          <h1
            style={heroDelay(1)}
            className="hy-hero-in mt-6 font-serif text-[52px] leading-[0.95] font-normal tracking-[-1.8px] text-balance text-ink-900 lg:text-[64px] lg:tracking-[-2.4px]"
          >
            Notes that never make you wait
          </h1>
        </div>

        <div className="min-w-0">
          <p style={heroDelay(2)} className="hy-hero-in text-[17px] leading-6.5 text-ink-500">
            Notes and a journal that live on your own device. Nothing to sign up for, and nothing to
            wait for.
          </p>

          <div style={heroDelay(3)} className="hy-hero-in mt-6 flex flex-wrap items-center gap-2">
            <Link
              href={appUrl}
              className={cn(primaryButton, "bg-ink-800 hover:bg-accent focus-visible:bg-accent")}
            >
              Open in your browser
            </Link>
            <DownloadButton
              className={cn(
                outlineButton,
                "h-10 bg-transparent px-4 text-ink-700 hover:bg-ink-900/7",
              )}
            />
          </div>

          <ul
            style={heroDelay(4)}
            className="hy-hero-in caps mt-6 flex flex-wrap items-center gap-1.5 text-ink-500"
          >
            {platforms.map(({ name, href, Mark }) => (
              <li key={name}>
                <Link
                  href={href}
                  className={cn(
                    chip,
                    "transition-colors duration-150 hover:border-ink-400 hover:text-ink-900 focus-visible:border-ink-400 focus-visible:outline-none",
                  )}
                >
                  <Mark className="size-3" />
                  {name}
                </Link>
              </li>
            ))}
            <Tooltip label={inTheWorks}>
              <li
                tabIndex={0}
                className={cn(
                  chip,
                  "cursor-help border-dashed text-ink-400 outline-none focus-visible:border-solid focus-visible:border-ink-400",
                )}
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
      </div>

      <div style={heroDelay(3)} className="hy-hero-in relative min-w-0">
        <p className="caps absolute -top-3 left-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-line bg-hy-bg px-2 py-0.5 text-[0.62rem] text-ink-500">
          <span aria-hidden className="hy-hero-live size-1.5 rounded-full bg-emerald-500" />
          live preview · click around
        </p>
        <div className="hy-dots rounded-[10px] border border-dashed border-line p-2 pt-4 sm:p-4 lg:p-6">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
