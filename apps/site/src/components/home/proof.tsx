"use client";

import { cn } from "@skriuw/shared/helpers/cn";
import { stagger, useReveal } from "@/components/ui/reveal";
import { proofMeasure, proofPoints } from "@/data/content";
import { badge } from "@/components/frame/control";
import { Callout } from "@/components/frame/callout";
import { SectionHead } from "@/components/frame/section-head";

export function HomeProof() {
  const gridRef = useReveal<HTMLDivElement>();

  return (
    <section id="speed">
      <SectionHead
        title="It's fast, and we check that on every change, not just once."
        action={{ label: "How we measure", href: "/docs/performance-contract/" }}
      />

      <div
        ref={gridRef}
        className="reveal-group mt-8 grid divide-y divide-dashed divide-line rounded-[10px] border border-line bg-hy-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        {proofPoints.map((point, index) => (
          <div key={point.label} style={stagger(index)} className="p-6">
            <span className={cn(badge, "bg-ink-900/8 text-ink-500")}>{point.label}</span>
            <h3 className="mt-6 font-serif text-[24px] leading-[28px] font-normal tracking-[-0.4px] text-balance text-ink-900">
              {point.title}
            </h3>
            <p className="mt-3 text-[14px] leading-[21px] text-ink-500">{point.body}</p>
          </div>
        ))}
      </div>

      <Callout className="mt-4">{proofMeasure}</Callout>
    </section>
  );
}
