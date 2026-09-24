"use client";

import { useRef, useState, type CSSProperties } from "react";
import { Action, CarouselNav, Container, Rail, SectionHeading } from "@/components/ui/primitives";
import { stagger, useReveal } from "@/components/ui/reveal";
import { appUrl, themes } from "@/data/content";
import { clamp } from "@skriuw/shared/helpers/clamp";

export function Themes() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const headingRef = useReveal<HTMLDivElement>();
  const railRef = useReveal<HTMLDivElement>();

  function scrollTo(next: number) {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const clamped = clamp(next, 0, themes.length - 1);
    setIndex(clamped);
    track.scrollTo({ left: clamped * 284, behavior: "smooth" });
  }

  return (
    <section id="themes" className="overflow-x-clip bg-surface py-24">
      <Container>
        <div
          ref={headingRef}
          className="reveal-wipe flex flex-wrap items-start justify-between gap-6"
        >
          <Rail>
            <SectionHeading
              lead="Nine themes, and type that suits you."
              trail="Sans, serif, or mono in the editor. Set once, everywhere."
            />
          </Rail>
          <div className="flex items-center gap-2">
            <CarouselNav
              onPrev={() => scrollTo(index - 1)}
              onNext={() => scrollTo(index + 1)}
              atStart={index === 0}
              atEnd={index === themes.length - 1}
            />
            <Action arrow="inline" href={appUrl}>
              Try them
            </Action>
          </div>
        </div>
      </Container>

      <div ref={railRef} className="reveal mx-auto mt-10 w-full max-w-6xl px-5">
        <div ref={trackRef} className="no-scrollbar -mr-[30vw] flex gap-4 overflow-x-auto pb-2">
          {themes.map((theme, card) => (
            <article
              key={theme.name}
              style={{ "--card": card } as CSSProperties}
              className="group w-[268px] shrink-0"
            >
              <div
                aria-hidden
                className="texture-dither flex h-[196px] flex-col justify-between rounded-[10px] p-5 transition-transform duration-250 ease-out group-hover:-translate-y-1 motion-reduce:transform-none"
                style={{ backgroundColor: theme.bg, color: theme.ink }}
              >
                <div className="space-y-2">
                  <span
                    style={stagger(0)}
                    className="vg-draw block h-2 w-20 rounded-full bg-current opacity-90"
                  />
                  <span
                    style={stagger(1)}
                    className="vg-draw block h-1.5 w-full rounded-full bg-current opacity-35"
                  />
                  <span
                    style={stagger(2)}
                    className="vg-draw block h-1.5 w-4/5 rounded-full bg-current opacity-35"
                  />
                  <span
                    style={stagger(3)}
                    className="vg-draw block h-1.5 w-2/3 rounded-full bg-current opacity-20"
                  />
                </div>
                <span className="font-serif text-[28px] tracking-[-0.02em] opacity-70 transition-opacity duration-200 ease group-hover:opacity-100">
                  Aa
                </span>
              </div>
              <p className="mt-4 text-[14px] leading-[20px] font-medium text-ink-500">
                <strong className="font-semibold text-ink-900">{theme.name}</strong>: {theme.note}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
