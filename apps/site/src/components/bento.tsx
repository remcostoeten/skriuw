"use client";

import type { ReactNode } from "react";
import { cn } from "@skriuw/shared/helpers/cn";
import { Action, Container, Rail, SectionHeading } from "@/components/ui/primitives";
import { stagger, useReveal } from "@/components/ui/reveal";
import { bentoCards, docsUrl } from "@/data/content";
import {
  EditorVignette,
  HistoryVignette,
  JournalVignette,
  LinksVignette,
  LockVignette,
  PaletteVignette,
} from "@/components/bento-vignettes";

const vignetteMap: Record<string, ReactNode> = {
  editor: <EditorVignette />,
  journal: <JournalVignette />,
  links: <LinksVignette />,
  history: <HistoryVignette />,
  lock: <LockVignette />,
  palette: <PaletteVignette />,
};

export function Bento() {
  const headingRef = useReveal<HTMLDivElement>();
  const gridRef = useReveal<HTMLDivElement>();

  return (
    <section id="features" className="bg-surface py-24">
      <Container>
        <div
          ref={headingRef}
          className="reveal-wipe flex flex-wrap items-start justify-between gap-6"
        >
          <Rail>
            <SectionHeading
              lead="Notes, journal, and tasks."
              trail="One app. Everything links to everything."
            />
          </Rail>
          <Action arrow="inline" href={`${docsUrl}/features`}>
            See every feature
          </Action>
        </div>

        <div
          ref={gridRef}
          className="reveal-group mt-10 grid border-t border-l border-border lg:grid-cols-12"
        >
          {bentoCards.map((card, index) => (
            <article
              key={card.title}
              style={stagger(index)}
              className={cn(
                "vg-card flex flex-col overflow-hidden border-r border-b border-border",
                "wide" in card && "lg:flex-row lg:items-stretch",
                card.span,
              )}
            >
              <div className={cn("p-8 pb-0", "wide" in card && "lg:w-[38%] lg:shrink-0 lg:pb-8")}>
                <p className="font-mono text-[11px] text-ink-400">
                  <span className="text-clay-500">{card.keys}</span>
                  <span className="mx-2 text-ink-300">/</span>
                  {card.hint}
                </p>
                <h3 className="mt-4 text-[18px] leading-6 font-medium tracking-[-0.01em] text-ink-900">
                  {card.title}
                </h3>
                <p className="mt-2 max-w-[400px] text-[15px] leading-[22px] text-ink-500">
                  {card.body}
                </p>
              </div>

              <div aria-hidden className="flex flex-1 pt-8 pl-8">
                {vignetteMap[card.vignette]}
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
