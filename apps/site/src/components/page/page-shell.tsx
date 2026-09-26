import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { badge, outlineButton, primaryButton } from "@/components/frame/control";
import { SectionHead } from "@/components/frame/section-head";

const panel = "rounded-[10px] border border-line bg-hy-card";

type PageAction = { label: string; href: string };

function Actions({ actions, className }: { actions: PageAction[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {actions.map((action, index) => (
        <Link
          key={action.href}
          href={action.href}
          className={index === 0 ? primaryButton : cn(outlineButton, "h-10 px-4")}
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

type HeroProps = {
  index: string;
  label: string;
  marks: string[];
  eyebrow: string;
  title: ReactNode;
  lede: string;
  actions: PageAction[];
};

export function PageHero({ index, label, marks, eyebrow, title, lede, actions }: HeroProps) {
  return (
    <section className="grid gap-10 py-14! lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end lg:gap-16 max-[620px]:py-10!">
      <div className="max-w-[720px]">
        <span className={cn(badge, "bg-ink-900/8 text-ink-700")}>{eyebrow}</span>
        <h1 className="mt-6 font-serif text-[40px] leading-[42px] font-normal tracking-[-1.2px] text-balance text-ink-900 md:text-[52px] md:leading-[52px] md:tracking-[-1.8px]">
          {title}
        </h1>
        <p className="mt-6 max-w-[600px] text-[17px] leading-[26px] text-ink-500">{lede}</p>
        <Actions actions={actions} className="mt-8" />
      </div>

      <aside className={cn(panel, "divide-y divide-dashed divide-line")}>
        <p className="caps flex items-center gap-2 px-5 py-3 text-ink-400">
          <span className="text-accent tabular-nums">{index}</span>
          {label}
        </p>
        <ul className="m-0 list-none divide-y divide-dashed divide-line p-0">
          {marks.map((mark) => (
            <li key={mark} className="flex items-center gap-3 px-5 py-3 text-[14px] text-ink-700">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
              {mark}
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}

type SectionProps = {
  index: string;
  label: string;
  lead: string;
  trail?: string;
  intro?: string;
  children?: ReactNode;
};

export function PageSection({ index, label, lead, trail, intro, children }: SectionProps) {
  return (
    <section>
      <SectionHead
        index={index}
        label={label}
        title={
          <>
            {lead}
            {trail ? <span className="text-ink-400"> {trail}</span> : null}
          </>
        }
      />
      {intro ? (
        <p className="mt-4 max-w-[640px] text-[15px] leading-[24px] text-ink-500">{intro}</p>
      ) : null}
      {children ? <div className="mt-8">{children}</div> : null}
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
    <div className={cn(panel, "overflow-hidden")}>
      <div className={cn("-mt-px -ml-px grid", gridColumns[columns])}>
        {items.map((item) => (
          <article
            key={item.title}
            className="flex flex-col gap-2 border-t border-l border-dashed border-line p-6"
          >
            {item.tag ? (
              <span className="font-mono text-[11px] text-accent">{item.tag}</span>
            ) : null}
            <h3 className="text-[15px] font-medium tracking-[-0.01em] text-ink-900">
              {item.title}
            </h3>
            <p className="text-[14px] leading-[22px] text-ink-500">{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

type NoteProps = {
  children: ReactNode;
  className?: string;
};

/** Accent-edged aside for a caveat or boundary the reader should not miss. */
export function Note({ children, className }: NoteProps) {
  return (
    <p
      className={cn(
        "rounded-[10px] border border-accent/35 bg-accent/5 px-5 py-4 text-[14px] leading-[22px] text-ink-700",
        className,
      )}
    >
      {children}
    </p>
  );
}

type BoundaryProps = {
  columns: Array<{ title: string; items: string[] }>;
  note?: ReactNode;
};

export function BoundaryLists({ columns, note }: BoundaryProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {columns.map((column) => (
        <div key={column.title} className={cn(panel, "divide-y divide-dashed divide-line")}>
          <h3 className="caps px-5 py-3 text-ink-400">{column.title}</h3>
          <ul className="m-0 list-none divide-y divide-dashed divide-line p-0">
            {column.items.map((item) => (
              <li
                key={item}
                className="flex gap-3 px-5 py-3 text-[14px] leading-[22px] text-ink-700"
              >
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {note ? <Note className="md:col-span-2">{note}</Note> : null}
    </div>
  );
}

type StepsProps = {
  steps: Array<{ index: string; title: string; body: string }>;
};

export function Steps({ steps }: StepsProps) {
  return (
    <ol
      className={cn(
        panel,
        "m-0 grid list-none divide-y divide-dashed divide-line p-0 md:grid-cols-3 md:divide-x md:divide-y-0",
      )}
    >
      {steps.map((step) => (
        <li key={step.index} className="flex flex-col gap-2 p-6">
          <span className="caps text-accent">{step.index}</span>
          <h3 className="mt-2 text-[16px] font-medium tracking-[-0.01em] text-ink-900">
            {step.title}
          </h3>
          <p className="text-[14px] leading-[22px] text-ink-500">{step.body}</p>
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
    <dl className="m-0 grid gap-8 md:grid-cols-3">
      {terms.map((entry) => (
        <div key={entry.term} className="border-l border-dashed border-line pl-5">
          <dt className="caps text-accent">{entry.term}</dt>
          <p className="mt-3 text-[16px] font-medium tracking-[-0.01em] text-ink-900">
            {entry.title}
          </p>
          <dd className="m-0 mt-2 text-[14px] leading-[22px] text-ink-500">{entry.body}</dd>
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
    <article className={cn(panel, "flex min-w-0 flex-col")}>
      <p className="caps flex items-center justify-between gap-3 border-b border-dashed border-line px-5 py-3 text-ink-400">
        {platform}
        <span className="text-ink-700">{title}</span>
      </p>
      <div className="flex flex-1 flex-col gap-5 p-5">
        <p className="text-[14px] leading-[22px] text-ink-500">{body}</p>
        <pre className="mt-auto overflow-x-auto rounded-md border border-line bg-hy-bg p-4 font-mono text-[12.5px] leading-[21px] text-ink-700">
          <code>{lines.join("\n")}</code>
        </pre>
      </div>
    </article>
  );
}

type PageCtaProps = {
  title: string;
  body: string;
  actions: PageAction[];
};

export function PageCta({ title, body, actions }: PageCtaProps) {
  return (
    <section>
      <div className="hy-dots grid place-items-center rounded-[10px] border border-dashed border-line px-6 py-16 text-center">
        <span className={cn(badge, "bg-ink-900/8 text-ink-700")}>
          free · open source · no account
        </span>
        <h2 className="mt-6 max-w-[640px] font-serif text-[34px] leading-[40px] font-normal tracking-[-1px] text-balance text-ink-900">
          {title}
        </h2>
        <p className="mt-4 max-w-[480px] text-[15px] leading-[23px] text-ink-500">{body}</p>
        <Actions actions={actions} className="mt-8 justify-center" />
      </div>
    </section>
  );
}
