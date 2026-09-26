"use client";

import { cn } from "@skriuw/shared/helpers/cn";
import { CountUp } from "@/components/ui/count-up";
import { stagger, useReveal } from "@/components/ui/reveal";
import { engineeringStats } from "@/data/content";
import { badge } from "@/components/hybrid/control";
import { HybridSectionHead } from "@/components/hybrid/section-head";

const tones = ["ok", "muted", "muted"] as const;

const toneClass: Record<(typeof tones)[number], string> = {
  ok: "bg-ok/15 text-ok",
  muted: "bg-ink-900/8 text-ink-500",
};

const toneLabel: Record<(typeof tones)[number], string> = {
  ok: "passing",
  muted: "measured",
};

export function HybridProof() {
  const gridRef = useReveal<HTMLDivElement>();

  return (
    <section id="speed">
      <HybridSectionHead
        index="02"
        label="proof"
        title="It's fast. Every number below comes from a test we run on every commit."
        action={{ label: "Read the contract", href: "/docs/performance-contract/" }}
      />

      <div
        ref={gridRef}
        className="reveal-group mt-8 grid divide-y divide-dashed divide-line rounded-[10px] border border-line bg-hy-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        {engineeringStats.map((stat, index) => (
          <div key={stat.value} style={stagger(index)} className="p-6">
            <span className={cn(badge, toneClass[tones[index]])}>
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {toneLabel[tones[index]]}
            </span>
            <p className="mt-6 font-mono text-[40px] leading-none font-medium tracking-[-0.03em] text-ink-900 tabular-nums">
              <CountUp value={stat.value} />
            </p>
            <p className="mt-4 text-[14px] leading-[21px] text-ink-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="caps mt-4 flex items-center gap-3 rounded-md border border-dashed border-line px-3 py-2 text-ink-500">
        <span aria-hidden className="hy-hatch animate-hy-hatch h-3 w-10 rounded-sm opacity-70" />
        switching notes touches neither the disk nor the database
      </div>
    </section>
  );
}
