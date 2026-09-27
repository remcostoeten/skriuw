"use client";

import { useEffect, useState } from "react";
import { cn } from "@skriuw/shared/helpers/cn";
import { themes } from "@/data/content";

const storageKey = "skriuw-site-palette";

function paletteId(name: string) {
  return name.toLowerCase().replaceAll(" ", "-");
}

export function HomeThemes() {
  const [selected, setSelected] = useState("skriuw");

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored && themes.some((theme) => paletteId(theme.name) === stored)) {
      setSelected(stored);
      document.documentElement.dataset.palette = stored;
    }
  }, []);

  function select(name: string) {
    const next = paletteId(name);
    setSelected(next);
    document.documentElement.dataset.palette = next;
    localStorage.setItem(storageKey, next);
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 py-5!">
      <p className="caps text-ink-400">
        <span className="mr-2 text-accent">04</span>
        themes · {themes.length} built in
      </p>
      <ul className="flex flex-wrap items-center gap-1.5">
        {themes.map((theme) => (
          <li key={theme.name}>
            <button
              type="button"
              title={`${theme.name}: ${theme.note}`}
              aria-pressed={selected === paletteId(theme.name)}
              onClick={() => select(theme.name)}
              className={cn(
                "caps inline-flex h-7 items-center gap-2 rounded-md border border-line bg-hy-card px-2.5 text-[0.65rem] text-ink-500 transition-colors duration-150 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                selected === paletteId(theme.name) && "border-accent text-ink-900",
              )}
            >
              <span
                aria-hidden
                className="grid size-3.5 place-items-center rounded-full border border-line"
                style={{ background: theme.bg }}
              >
                <span className="size-1.5 rounded-full" style={{ background: theme.ink }} />
              </span>
              {theme.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
