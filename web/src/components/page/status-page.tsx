import type { ReactNode } from "react";
import Link from "next/link";
import { Container, Rail } from "@/components/ui/primitives";

type Props = {
  code: string;
  title: string;
  lede: string;
  actions: ReactNode;
  note?: ReactNode;
  suggestions: Array<{ label: string; href: string; hint: string }>;
};

export function StatusPage({ code, title, lede, actions, note, suggestions }: Props) {
  return (
    <section className="border-b border-border bg-surface">
      <Container className="flex min-h-[62vh] flex-col justify-center gap-14 py-24">
        <div>
          <span className="font-mono text-[13px] tracking-[0.08em] text-ink-400 uppercase">
            {code}
          </span>
          <Rail className="mt-5">
            <h1 className="max-w-[720px] font-serif text-[40px] leading-[46px] font-normal tracking-[-0.9px] text-balance text-ink-900 md:text-[52px] md:leading-[56px]">
              {title}
            </h1>
          </Rail>
          <p className="mt-6 max-w-[580px] text-[17px] leading-[27px] text-ink-500">{lede}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">{actions}</div>
          {note ? (
            <p className="mt-6 font-mono text-[13px] leading-[22px] text-ink-400">{note}</p>
          ) : null}
        </div>

        <nav
          aria-label="Suggested pages"
          className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"
        >
          {suggestions.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col gap-2 bg-surface p-6 transition-colors hover:bg-ink-100 focus-visible:bg-focus-tint"
            >
              <span className="text-[16px] font-medium text-ink-900">{item.label}</span>
              <span className="text-[14px] leading-[22px] text-ink-500">{item.hint}</span>
            </Link>
          ))}
        </nav>
      </Container>
    </section>
  );
}
