"use client";

import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { stagger, useReveal } from "@/components/ui/reveal";
import { Apple, Globe, Linux, Windows } from "@/components/ui/icons";
import { installChannels, platformStories } from "@/data/content";
import { card, outlineButton } from "@/components/hybrid/control";
import { HybridSectionHead } from "@/components/hybrid/section-head";

const iconMap = {
  browser: Globe,
  macos: Apple,
  linux: Linux,
  windows: Windows,
};

export function HybridPlatforms() {
  const gridRef = useReveal<HTMLDivElement>();

  return (
    <section id="platforms">
      <HybridSectionHead
        index="03"
        label="platforms"
        title="The same Rust core on desktop, in the browser, and in your own files."
        action={{ label: "Download", href: "/download/" }}
      />

      <div ref={gridRef} className="reveal-group mt-8 grid gap-3 md:grid-cols-3">
        {platformStories.map((story, index) => (
          <article key={story.kicker} style={stagger(index)} className={cn(card, "p-5")}>
            <p className="caps text-ink-400">{story.kicker}</p>
            <p className="mt-3 text-[15px] leading-[22px] text-ink-500">
              {story.lead}{" "}
              <strong className="font-medium text-ink-900">{story.brand}</strong> {story.tail}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-dashed border-line pt-4">
              {story.stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="font-mono text-[18px] leading-none font-medium tracking-[-0.02em] text-ink-900 tabular-nums">
                    {stat.value}
                  </dt>
                  <dd className="m-0 mt-2 text-[12px] leading-[17px] text-ink-500">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-2">
        {installChannels.map((channel) => {
          const Icon = iconMap[channel.icon];
          return (
            <li key={channel.name}>
              <Link href={channel.href} className={outlineButton} title={channel.summary}>
                <Icon className="size-3" />
                {channel.name}
                <span className="font-sans text-[0.72rem] normal-case tracking-normal opacity-60">
                  {channel.hint.replace(/`/g, "")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
