import { themes } from "@/data/content";

export function HomeThemes() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 py-5!">
      <p className="caps text-ink-400">
        <span className="mr-2 text-accent">04</span>
        themes · {themes.length} built in
      </p>
      <ul className="flex flex-wrap items-center gap-1.5">
        {themes.map((theme) => (
          <li
            key={theme.name}
            title={`${theme.name}: ${theme.note}`}
            className="caps inline-flex h-7 items-center gap-2 rounded-md border border-line bg-hy-card px-2.5 text-[0.65rem] text-ink-500"
          >
            <span
              aria-hidden
              className="grid size-3.5 place-items-center rounded-full border border-line"
              style={{ background: theme.bg }}
            >
              <span className="size-1.5 rounded-full" style={{ background: theme.ink }} />
            </span>
            {theme.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
