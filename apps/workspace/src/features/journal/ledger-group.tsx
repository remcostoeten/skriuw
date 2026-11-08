import { useEffect, useRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/styling/class-names";
import { journalLedger, type JournalGroupId } from "./ledger";

export const journalTransition =
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]";
export const journalPress = "active:scale-[0.97] motion-reduce:active:scale-100";

export const journalRowButton = cn(
  "relative grid w-full cursor-pointer border-0 bg-transparent p-0 text-left",
  "before:pointer-events-none before:absolute before:inset-x-[-10px] before:inset-y-0.5 before:rounded-lg before:bg-transparent hover:before:bg-theme-hover/55 focus-visible:before:bg-theme-hover focus-visible:outline-none",
  "before:transition-colors before:duration-150 before:ease-[cubic-bezier(0.23,1,0.32,1)]",
  "[&>*]:relative",
);

type Props = {
  id: JournalGroupId;
  title: string;
  heading?: ReactNode;
  margin?: ReactNode;
  marginProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
};

export function JournalGroup({ id, title, heading, margin, marginProps, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    return journalLedger.register({ id, title, element });
  }, [id, title]);
  const headingId = `journal-group-${id}-title`;
  return (
    <section
      ref={ref}
      id={`journal-group-${id}`}
      aria-labelledby={headingId}
      className="grid grid-cols-[168px_minmax(0,1fr)] gap-x-7 border-t border-theme-divider/85 pt-[22px] pb-3.5 first:border-t-0 first:pt-3 max-[899px]:grid-cols-1"
    >
      <div
        {...marginProps}
        className="sticky top-3.5 min-w-0 self-start max-[899px]:static max-[899px]:mb-2"
      >
        <h2
          id={headingId}
          className="m-0 text-[13px] font-medium tracking-[-0.005em] text-foreground"
        >
          {heading ?? title}
        </h2>
        {margin}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function MarginText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-1 text-xs leading-[1.45] text-theme-secondary", className)}>{children}</p>
  );
}

export function MarginLive({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="mt-2.5 text-[11.5px] tabular-nums text-theme-dim">
      {children}
    </p>
  );
}

export function MarginMeter({
  fraction,
  label,
  text,
}: {
  fraction: number;
  label: string;
  text: string;
}) {
  return (
    <div role="img" aria-label={label} className="mt-3 max-w-[150px]">
      <span className="block h-1 overflow-hidden rounded bg-theme-hover">
        <span
          className="block h-full w-full origin-left rounded bg-accent-ink transition-transform duration-[280ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
          style={{ transform: `scaleX(${fraction})` }}
        />
      </span>
      <small className="mt-1.5 block text-[11px] tabular-nums text-theme-dim">{text}</small>
    </div>
  );
}

export function JournalRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex min-h-[42px] items-center justify-between gap-3 border-b border-theme-divider/85 py-2.5 text-[13px] last:border-b-0">
      <span className="text-foreground">{label}</span>
      <span className="text-[12.5px] tabular-nums text-theme-secondary">{children}</span>
    </li>
  );
}
