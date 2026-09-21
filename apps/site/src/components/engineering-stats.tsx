"use client";

import type { ReactNode } from "react";
import { Action, Container, Rail, SectionHeading } from "@/components/ui/primitives";
import { Activity, Bolt, Gauge } from "@/components/ui/icons";
import { CountUp } from "@/components/ui/count-up";
import { stagger, useReveal } from "@/components/ui/reveal";
import { engineeringStats } from "@/data/content";

const iconMap: Record<string, ReactNode> = {
  bolt: <Bolt className="size-5" />,
  activity: <Activity className="size-5" />,
  gauge: <Gauge className="size-5" />,
};

export function EngineeringStats() {
  const headingRef = useReveal<HTMLDivElement>();
  const gridRef = useReveal<HTMLDivElement>();

  return (
    <section id="speed" className="bg-surface py-24">
      <Container>
        <div
          ref={headingRef}
          className="reveal-wipe flex flex-wrap items-start justify-between gap-6"
        >
          <Rail>
            <SectionHeading
              lead="It's fast. Here's the proof."
              trail="Every number below comes from a test we run on every commit."
            />
          </Rail>
          <Action arrow="inline" href={"/docs/performance-contract/"}>
            Read the contract
          </Action>
        </div>

        <div
          ref={gridRef}
          className="reveal-group mt-10 grid border-t border-l border-border sm:grid-cols-3"
        >
          {engineeringStats.map((stat, index) => (
            <div
              key={stat.value}
              style={stagger(index)}
              className="group border-r border-b border-border p-8 transition-colors duration-300 hover:bg-muted"
            >
              <span className="inline-block text-ink-400 transition-colors duration-200 ease group-hover:text-clay-500">
                {iconMap[stat.icon]}
              </span>
              <p className="mt-6 text-[44px] leading-none font-medium tracking-[-0.03em] text-ink-900">
                <CountUp value={stat.value} />
              </p>
              <p className="mt-4 text-[16px] leading-6 text-ink-500">{stat.label}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-[640px] text-[15px] leading-[22px] text-ink-500">
          Switching notes touches neither the disk nor the database. Your whole workspace is already
          in memory, so there is nothing to fetch and nothing to wait for. If a change makes any of
          these numbers worse, it does not ship until it is fixed.
        </p>
      </Container>
    </section>
  );
}
