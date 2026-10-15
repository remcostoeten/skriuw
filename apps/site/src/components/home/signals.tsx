"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { importSources } from "@/data/content";

const shownCount = 5;
const shown = importSources.slice(0, shownCount);
const rest = importSources.slice(shownCount);

const chip =
  "caps inline-flex h-7 items-center rounded-md border border-line bg-hy-card px-2.5 text-[0.65rem] text-ink-500 transition-colors duration-150 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function chipDelay(index: number): CSSProperties {
  return { "--chip-delay": `${index * 40}ms` } as CSSProperties;
}

export function HomeSignals() {
  const [expanded, setExpanded] = useState(false);
  const sources = expanded ? importSources : shown;

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 py-5!">
      <p className="caps text-ink-400">Imports from</p>
      <ul className="flex flex-wrap items-center gap-1.5">
        {sources.map((source, index) => (
          <li
            key={source.name}
            style={chipDelay(index - shownCount)}
            className={cn(index >= shownCount && "hy-chip-in")}
          >
            <Link href="/import/" className={chip}>
              {source.name}
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className={cn(chip, "transition-transform duration-150 active:scale-[0.97]")}
          >
            {expanded ? "fewer" : `and ${rest.length} more`}
          </button>
        </li>
      </ul>
    </section>
  );
}
