"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { stagger, useReveal } from "@/components/ui/reveal";
import { Android, Apple, Globe, Linux, Windows } from "@/components/ui/icons";
import { appUrl, releasesUrl, repoUrl } from "@/data/content";
import { badge, card, outlineButton } from "@/components/frame/control";
import { SectionHead } from "@/components/frame/section-head";
import {
  BrowserVignette,
  DesktopVignette,
  FilesVignette,
} from "@/components/home/platform-vignettes";

type Action = { label: string; href: string; icon?: ReactNode };

type Surface = {
  label: string;
  lead: string;
  body: string;
  actions: Action[];
  tags: string[];
  vignette: ReactNode;
};

const surfaces: Surface[] = [
  {
    label: "Desktop",
    lead: "The full app, offline.",
    body: "Everything in one file on your disk. No account and no internet needed.",
    actions: [
      { label: "macOS", href: releasesUrl, icon: <Apple className="size-3" /> },
      { label: "Windows", href: releasesUrl, icon: <Windows className="size-3" /> },
      { label: "Linux", href: releasesUrl, icon: <Linux className="size-3" /> },
    ],
    tags: [],
    vignette: <DesktopVignette />,
  },
  {
    label: "Browser",
    lead: "The same app, in a tab.",
    body: "Open skriuw.com/app and start writing. Nothing is uploaded until you sign in.",
    actions: [{ label: "Open the app", href: appUrl, icon: <Globe className="size-3" /> }],
    tags: ["installs to home screen"],
    vignette: <BrowserVignette />,
  },
  {
    label: "Your files",
    lead: "Plain Markdown, any time.",
    body: "A backup every six hours, checked after it is written, and all of the code is open source.",
    actions: [{ label: "Source", href: repoUrl }],
    tags: ["markdown", "6 h backups"],
    vignette: <FilesVignette />,
  },
];

export function HomePlatforms() {
  const gridRef = useReveal<HTMLDivElement>();

  return (
    <section id="platforms">
      <SectionHead
        title="The same app on your desktop, in your browser, and in your own files."
        action={{ label: "Download", href: "/download/" }}
      />

      <div ref={gridRef} className="reveal-group mt-8 grid gap-3 lg:grid-cols-3">
        {surfaces.map((surface, index) => (
          <article
            key={surface.label}
            style={stagger(index)}
            className={cn(card, "vg-card flex flex-col overflow-hidden")}
          >
            <div className="p-5 pb-0">
              <p className="caps text-ink-400">{surface.label}</p>
              <p className="mt-3 text-[15px] leading-[22px] text-ink-900">
                <strong className="font-medium">{surface.lead}</strong>{" "}
                <span className="text-ink-500">{surface.body}</span>
              </p>
              <p className="mt-4 flex flex-wrap items-center gap-1.5">
                {surface.actions.map((action) => (
                  <Link key={action.label} href={action.href} className={outlineButton}>
                    {action.icon}
                    {action.label}
                  </Link>
                ))}
                {surface.tags.map((tag) => (
                  <span key={tag} className={cn(badge, "bg-ink-900/8 text-ink-500")}>
                    {tag}
                  </span>
                ))}
              </p>
            </div>

            <div aria-hidden className="flex flex-1 pt-6 pl-5">
              {surface.vignette}
            </div>
          </article>
        ))}

        <div
          style={stagger(surfaces.length)}
          className="hy-dots flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[10px] border border-dashed border-line px-5 py-4 lg:col-span-3"
        >
          <span
            aria-hidden
            className="grid h-10 w-6 shrink-0 place-items-center rounded-[5px] border border-dashed border-ink-400 text-ink-400"
          >
            <span className="size-1 rounded-full bg-current" />
          </span>
          <p className="min-w-[220px] flex-1 text-[14px] leading-[21px] text-ink-900">
            <strong className="font-medium">Mobile, in the works.</strong>{" "}
            <span className="text-ink-500">
              iOS and Android apps are on the way. Until then, the browser version installs to your
              home screen.
            </span>
          </p>
          <p className="flex gap-1.5">
            <span className={cn(badge, "bg-ink-900/8 text-ink-500")}>
              <Apple className="size-2.5" />
              iOS
            </span>
            <span className={cn(badge, "bg-ink-900/8 text-ink-500")}>
              <Android className="size-2.5" />
              Android
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
