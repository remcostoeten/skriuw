"use client";

import type { ReactNode } from "react";
import { cn } from "@skriuw/shared/helpers/cn";
import { stagger, useReveal } from "@/components/ui/reveal";
import { bentoCards } from "@/data/content";
import {
  EditorVignette,
  HistoryVignette,
  JournalVignette,
  LinksVignette,
  LockVignette,
  PaletteVignette,
} from "@/components/bento-vignettes";
import { badge, card } from "@/components/hybrid/control";
import { HybridSectionHead } from "@/components/hybrid/section-head";

const vignetteMap: Record<string, ReactNode> = {
  editor: <EditorVignette />,
  journal: <JournalVignette />,
  links: <LinksVignette />,
  history: <HistoryVignette />,
  lock: <LockVignette />,
  palette: <PaletteVignette />,
};

export function HybridFeatures() {
  const gridRef = useReveal<HTMLDivElement>();

  return (
    <section id="features">
      <HybridSectionHead
        index="01"
        label="features"
        title="Notes, journal, and tasks. One app, everything links to everything."
        action={{ label: "Every feature", href: "/docs/features/" }}
      />

      <div ref={gridRef} className="reveal-group mt-8 grid gap-3 lg:grid-cols-12">
        {bentoCards.map((bentoCard, index) => (
          <article
            key={bentoCard.title}
            style={stagger(index)}
            className={cn(
              card,
              "vg-card flex flex-col overflow-hidden",
              "wide" in bentoCard && "lg:flex-row lg:items-stretch",
              bentoCard.span,
            )}
          >
            <div className={cn("p-5 pb-0", "wide" in bentoCard && "lg:w-[38%] lg:shrink-0 lg:pb-5")}>
              <p className="flex items-center gap-2">
                <span className={cn(badge, "bg-ink-900/8 text-ink-700")}>{bentoCard.keys}</span>
                <span className="caps text-[0.62rem] text-ink-400">{bentoCard.hint}</span>
              </p>
              <h3 className="mt-4 text-[16px] leading-[1.3] font-medium tracking-[-0.01em] text-ink-900">
                {bentoCard.title}
              </h3>
              <p className="mt-2 max-w-[400px] text-[14px] leading-[21px] text-ink-500">
                {bentoCard.body}
              </p>
            </div>

            <div aria-hidden className="flex flex-1 pt-6 pl-5">
              {vignetteMap[bentoCard.vignette]}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
