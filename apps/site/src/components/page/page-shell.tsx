import type { ReactNode } from "react";
import { Action, Container, Rail, cx } from "@/components/ui/primitives";

type HeroProps = {
  kicker: string;
  marks: string[];
  eyebrow: string;
  title: ReactNode;
  lede: string;
  actions: Array<{ label: string; href: string; variant?: "solid" | "outline" }>;
};

export function PageHero({ kicker, marks, eyebrow, title, lede, actions }: HeroProps) {
  return (
    <section className="border-b border-border bg-surface">
      <Container className="grid gap-10 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:py-28">
        <aside className="flex flex-col gap-4">
          <span className="font-mono text-[13px] tracking-[0.08em] text-ink-400 uppercase">
            {kicker}
          </span>
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
            {marks.map((mark) => (
              <li
                key={mark}
                className="rounded-full border border-border px-3 py-1 text-[13px] text-ink-500"
              >
                {mark}
              </li>
            ))}
          </ul>
        </aside>

        <div>
          <p className="text-[14px] text-ink-400">{eyebrow}</p>
          <h1 className="mt-4 max-w-[720px] font-serif text-[38px] leading-[44px] font-normal tracking-[-0.8px] text-balance text-ink-900 md:text-[48px] md:leading-[52px]">
            {title}
          </h1>
          <p className="mt-6 max-w-[620px] text-[16px] leading-[26px] text-ink-500">{lede}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            {actions.map((action, index) => (
              <Action
                key={action.href}
                href={action.href}
                size="lg"
                variant={action.variant ?? (index === 0 ? "solid" : "outline")}
                arrow={index === 0 ? "disc" : undefined}
              >
                {action.label}
              </Action>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

type SectionProps = {
  label: string;
  lead: string;
  trail?: string;
  intro?: string;
  children?: ReactNode;
  tinted?: boolean;
};

export function PageSection({ label, lead, trail, intro, children, tinted }: SectionProps) {
  return (
    <section className={cx("border-b border-border py-20", tinted ? "bg-panel" : "bg-surface")}>
      <Container>
        <p className="font-mono text-[13px] tracking-[0.08em] text-ink-400 uppercase">{label}</p>
        <Rail className="mt-5">
          <h2 className="max-w-[760px] font-serif text-[28px] leading-[34px] font-normal tracking-[-0.56px] text-balance">
            <span className="text-ink-900">{lead}</span>
            {trail ? <span className="block text-ink-700">{trail}</span> : null}
          </h2>
        </Rail>
        {intro ? (
          <p className="mt-6 max-w-[680px] text-[15px] leading-[24px] text-ink-500">{intro}</p>
        ) : null}
        {children ? <div className="mt-12">{children}</div> : null}
      </Container>
    </section>
  );
}

type CardGridProps = {
  columns?: 2 | 3 | 4;
  items: Array<{ tag?: string; title: string; body: ReactNode }>;
};

const gridColumns: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export function CardGrid({ columns = 3, items }: CardGridProps) {
  return (
    <div
      className={cx(
        "grid gap-px overflow-hidden rounded-card border border-border bg-border",
        gridColumns[columns],
      )}
    >
      {items.map((item) => (
        <article key={item.title} className="flex flex-col gap-3 bg-surface p-6">
          {item.tag ? (
            <span className="font-mono text-[12px] tracking-[0.06em] text-ink-400 uppercase">
              {item.tag}
            </span>
          ) : null}
          <h3 className="text-[17px] font-medium text-ink-900">{item.title}</h3>
          <p className="text-[15px] leading-[24px] text-ink-500">{item.body}</p>
        </article>
      ))}
    </div>
  );
}

type BoundaryProps = {
  columns: Array<{ title: string; items: string[] }>;
  note?: ReactNode;
};

export function BoundaryLists({ columns, note }: BoundaryProps) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      {columns.map((column) => (
        <div key={column.title} className="rounded-card border border-border bg-surface p-7">
          <h3 className="text-[17px] font-medium text-ink-900">{column.title}</h3>
          <ul className="mt-5 space-y-3">
            {column.items.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-[24px] text-ink-500">
                <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-ink-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {note ? (
        <p className="rounded-card border border-clay-300 bg-clay-100 p-6 text-[15px] leading-[24px] text-ink-700 md:col-span-2">
          {note}
        </p>
      ) : null}
    </div>
  );
}

type StepsProps = {
  steps: Array<{ index: string; title: string; body: string }>;
};

export function Steps({ steps }: StepsProps) {
  return (
    <ol className="grid gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-3">
      {steps.map((step) => (
        <li key={step.index} className="flex flex-col gap-3 bg-surface p-7">
          <span className="font-mono text-[13px] tracking-[0.06em] text-ink-400">{step.index}</span>
          <h3 className="text-[18px] font-medium text-ink-900">{step.title}</h3>
          <p className="text-[15px] leading-[24px] text-ink-500">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

type TermsProps = {
  terms: Array<{ term: string; title: string; body: string }>;
};

export function TermGrid({ terms }: TermsProps) {
  return (
    <dl className="grid gap-8 md:grid-cols-3">
      {terms.map((entry) => (
        <div key={entry.term}>
          <dt className="font-mono text-[12px] tracking-[0.06em] text-ink-400 uppercase">
            {entry.term}
          </dt>
          <p className="mt-3 text-[17px] font-medium text-ink-900">{entry.title}</p>
          <dd className="mt-2 text-[15px] leading-[24px] text-ink-500">{entry.body}</dd>
        </div>
      ))}
    </dl>
  );
}

type CodeCardProps = {
  platform: string;
  title: string;
  body: string;
  lines: string[];
};

export function CodeCard({ platform, title, body, lines }: CodeCardProps) {
  return (
    <article className="flex flex-col rounded-card border border-border bg-surface p-6">
      <span className="font-mono text-[12px] tracking-[0.06em] text-ink-400 uppercase">
        {platform}
      </span>
      <h3 className="mt-3 text-[17px] font-medium text-ink-900">{title}</h3>
      <p className="mt-2 text-[15px] leading-[24px] text-ink-500">{body}</p>
      <pre className="mt-5 overflow-x-auto rounded border border-border bg-panel p-4 font-mono text-[13px] leading-[22px] text-ink-700">
        <code>{lines.join("\n")}</code>
      </pre>
    </article>
  );
}

type PageCtaProps = {
  title: string;
  body: string;
  actions: Array<{ label: string; href: string }>;
};

export function PageCta({ title, body, actions }: PageCtaProps) {
  return (
    <section className="bg-surface py-24">
      <Container>
        <div className="rounded-card bg-ink-900 px-8 py-16 text-center md:px-16">
          <h2 className="mx-auto max-w-[680px] font-serif text-[28px] leading-[34px] font-normal tracking-[-0.56px] text-balance text-white">
            {title}
          </h2>
          <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[24px] text-white/70">
            {body}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {actions.map((action, index) => (
              <Action
                key={action.href}
                href={action.href}
                size="lg"
                variant={index === 0 ? "light" : "onDark"}
                arrow={index === 0 ? "disc" : undefined}
              >
                {action.label}
              </Action>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
