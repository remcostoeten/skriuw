import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { card } from "@/components/frame/control";
import { SiteFrame } from "@/components/frame/site-frame";

type Props = {
  code: string;
  label: string;
  title: string;
  lede: string;
  actions: ReactNode;
  note?: ReactNode;
  suggestions: Array<{ label: string; href: string; hint: string }>;
};

export function StatusPage({ code, label, title, lede, actions, note, suggestions }: Props) {
  return (
    <SiteFrame>
      <section className="hy-dots py-20! max-[620px]:py-12!">
        <p className="caps flex items-center gap-2 text-ink-400">
          <span className="text-accent tabular-nums">{code}</span>
          {label}
        </p>
        <h1 className="mt-5 max-w-[720px] font-serif text-[40px] leading-[42px] font-normal tracking-[-1.2px] text-balance text-ink-900 md:text-[52px] md:leading-[52px] md:tracking-[-1.8px]">
          {title}
        </h1>
        <p className="mt-6 max-w-[580px] text-[17px] leading-[26px] text-ink-500">{lede}</p>
        <div className="mt-8 flex flex-wrap items-center gap-2">{actions}</div>
        {note ? <p className="mt-6 font-mono text-[12px] text-ink-400">{note}</p> : null}
      </section>

      <nav aria-label="Suggested pages">
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {suggestions.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={cn(card, "flex h-full flex-col gap-2 p-5")}>
                <span className="text-[15px] font-medium text-ink-900">{item.label}</span>
                <span className="text-[14px] leading-[21px] text-ink-500">{item.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </SiteFrame>
  );
}
