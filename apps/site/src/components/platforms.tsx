"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Action, CarouselNav, Container, Rail, SectionHeading } from "@/components/ui/primitives";
import { useReveal } from "@/components/ui/reveal";
import { BrowserArt, DataArt, DesktopArt } from "@/components/platform-art";
import { docsUrl, platformStories } from "@/data/content";
import { clamp } from "@skriuw/shared/helpers/clamp";
import { cn } from "@skriuw/shared/helpers/cn";

const toneStyles = {
  dark: {
    panel: "bg-panel text-white ring-1 ring-panel-border",
    art: "bg-[#2b2727]",
    link: "focus-visible:text-[#ddb9b9]",
  },
  sage: {
    panel: "bg-[#9fb7a6] text-ink-900",
    art: "bg-[#87a390]",
    link: "focus-visible:text-[#7a3f3f]",
  },
  plum: {
    panel: "bg-[#6f5560] text-white",
    art: "bg-[#5d4652]",
    link: "focus-visible:text-[#e8cdcd]",
  },
} as const;

const artMap: Record<string, ReactNode> = {
  Desktop: <DesktopArt />,
  Browser: <BrowserArt />,
  "Your data": <DataArt />,
};

export function Platforms() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const headingRef = useReveal<HTMLDivElement>();

  function scrollTo(next: number) {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const clamped = clamp(next, 0, platformStories.length - 1);
    setIndex(clamped);
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }

  return (
    <section className="bg-surface pb-24">
      <Container>
        <div
          ref={headingRef}
          className="reveal-wipe flex flex-wrap items-start justify-between gap-6 pb-10"
        >
          <Rail>
            <SectionHeading
              lead="Desktop and browser."
              trail="Same Rust engine, same files, either way."
            />
          </Rail>
          <div className="flex items-center gap-2">
            <CarouselNav
              onPrev={() => scrollTo(index - 1)}
              onNext={() => scrollTo(index + 1)}
              atStart={index === 0}
              atEnd={index === platformStories.length - 1}
            />
            <Action arrow="inline" href={`${docsUrl}/architecture`}>
              How it is built
            </Action>
          </div>
        </div>
      </Container>

      <Container>
        <div
          ref={trackRef}
          className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-[14px]"
        >
          {platformStories.map((story) => {
            const tone = toneStyles[story.tone];

            return (
              <article
                key={story.kicker}
                className={cn(
                  "grid min-h-[420px] w-full shrink-0 snap-start overflow-hidden rounded-[14px] md:grid-cols-2",
                  tone.panel,
                )}
              >
                <div className="flex flex-col p-10">
                  <p className="text-[17.6px] font-bold opacity-90">{story.kicker}</p>
                  <h3 className="mt-6 max-w-[520px] font-serif text-[24px] leading-[30px] font-normal tracking-[-0.3px]">
                    {story.lead} <strong className="font-semibold">{story.brand}</strong>{" "}
                    {story.tail}
                  </h3>

                  <div className="mt-8 flex gap-12">
                    {story.stats.map((stat) => (
                      <div key={stat.label}>
                        <p className="text-[32px] leading-none font-normal tracking-[-0.02em]">
                          {stat.value}
                        </p>
                        <p className="mt-3 max-w-[160px] text-[15px] leading-[20px] opacity-75">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <Link
                    href={`${docsUrl}/features`}
                    className={cn(
                      "mt-auto pt-8 text-[15px] underline underline-offset-4 opacity-80 transition-colors duration-150 ease-out focus-visible:opacity-100",
                      tone.link,
                    )}
                  >
                    What runs where
                  </Link>
                </div>

                <div
                  aria-hidden
                  className={cn(
                    "relative hidden place-items-center overflow-hidden p-10 md:grid",
                    tone.art,
                  )}
                >
                  <span className="pattern-field texture-dither" />
                  <div className="relative grid w-full place-items-center">
                    {artMap[story.kicker]}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
