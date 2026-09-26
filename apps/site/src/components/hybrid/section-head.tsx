import type { ReactNode } from "react";
import Link from "next/link";
import { outlineButton } from "@/components/hybrid/control";

type Props = {
  index: string;
  label: string;
  title: ReactNode;
  action?: { label: string; href: string };
};

export function HybridSectionHead({ index, label, title, action }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="caps flex items-center gap-2 text-ink-400">
          <span className="text-accent tabular-nums">{index}</span>
          {label}
        </p>
        <h2 className="mt-4 max-w-[560px] font-serif text-[30px] leading-[36px] font-normal tracking-[-0.6px] text-balance text-ink-900">
          {title}
        </h2>
      </div>
      {action ? (
        <Link href={action.href} className={outlineButton}>
          {action.label}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}
