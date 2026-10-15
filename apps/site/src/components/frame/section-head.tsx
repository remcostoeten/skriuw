import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { outlineButton } from "@/components/frame/control";

type Props = {
  index?: string;
  label?: string;
  title: ReactNode;
  action?: { label: string; href: string };
};

export function SectionHead({ index, label, title, action }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        {label ? (
          <p className="caps flex items-center gap-2 text-ink-400">
            {index ? <span className="text-accent tabular-nums">{index}</span> : null}
            {label}
          </p>
        ) : null}
        <h2
          className={cn(
            "max-w-[560px] font-serif text-[30px] leading-[36px] font-normal tracking-[-0.6px] text-balance text-ink-900",
            label && "mt-4",
          )}
        >
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
