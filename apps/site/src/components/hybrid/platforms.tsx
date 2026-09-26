"use client";

import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { stagger, useReveal } from "@/components/ui/reveal";
import { Apple, Globe, Linux, Windows } from "@/components/ui/icons";
import { installChannels, releasesUrl } from "@/data/content";
import { badge, outlineButton } from "@/components/hybrid/control";
import { HybridSectionHead } from "@/components/hybrid/section-head";
import { DesktopArt } from "@/components/platform-art";

const iconMap = {
  browser: Globe,
  macos: Apple,
  linux: Linux,
  windows: Windows,
};

const rows = [
  {
    label: "Desktop",
    lead: "The full app, offline.",
    body: "One SQLite file on your disk, a Rust core, no account and no network needed.",
    tags: ["one file", "rust core", "offline"],
    channels: ["macos", "windows", "linux"],
  },
  {
    label: "Browser",
    lead: "The same core, compiled to WebAssembly.",
    body: "Try the real app at skriuw.com/app without installing anything. Zero bytes leave the tab until you sign in.",
    tags: ["0 bytes out", "installs to home screen"],
    channels: ["browser"],
  },
  {
    label: "Mobile",
    lead: "In the works.",
    body: "Native iOS and Android apps on the same core. Until then, the browser build installs to your home screen.",
    tags: ["ios", "android", "in the works"],
    channels: [],
  },
  {
    label: "Your data",
    lead: "Exportable to plain Markdown, any time.",
    body: "Versioned archives, six-hourly verified backups, and MIT-licensed source.",
    tags: ["markdown", "6 h backups", "mit"],
    channels: [],
  },
] as const;

export function HybridPlatforms() {
  const listRef = useReveal<HTMLDivElement>();

  return (
    <section id="platforms">
      <HybridSectionHead
        index="03"
        label="platforms"
        title="The same Rust core on desktop, in the browser, and in your own files."
        action={{ label: "Download", href: "/download/" }}
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div
          ref={listRef}
          className="reveal-group mt-8 divide-y divide-dashed divide-line rounded-[10px] border border-line bg-hy-card"
        >
          {rows.map((row, index) => (
            <div
              key={row.label}
              style={stagger(index)}
              className="grid gap-4 p-5 md:grid-cols-[120px_minmax(0,1fr)_auto] md:items-start"
            >
              <p className="caps pt-0.5 text-ink-400">{row.label}</p>

              <div className="min-w-0">
                <p className="text-[15px] leading-[22px] text-ink-900">
                  <strong className="font-medium">{row.lead}</strong>{" "}
                  <span className="text-ink-500">{row.body}</span>
                </p>
                <p className="mt-3 flex flex-wrap gap-1.5">
                  {row.tags.map((tag) => (
                    <span key={tag} className={cn(badge, "bg-ink-900/8 text-ink-500")}>
                      {tag}
                    </span>
                  ))}
                </p>
              </div>

              {row.channels.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5 md:justify-end">
                  {row.channels.map((key) => {
                    const channel = installChannels.find((item) => item.icon === key);
                    const Icon = iconMap[key];
                    return (
                      <li key={key}>
                        <Link
                          href={channel?.href ?? releasesUrl}
                          title={channel?.hint.replace(/`/g, "")}
                          className={outlineButton}
                        >
                          <Icon className="size-3" />
                          {channel?.name ?? key}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ))}
        </div>

        <div className="hy-dots grid place-items-center rounded-[10px] border border-line bg-ink-900 p-8 text-surface [--line:color-mix(in_srgb,currentColor_14%,transparent)]">
          <DesktopArt />
        </div>
      </div>
    </section>
  );
}
