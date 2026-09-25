import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { ArrowRight, ChevronLeft, ChevronRight } from "@/components/ui/icons";

type ContainerProps = {
  children: ReactNode;
  className?: string;
};

export function Container({ children, className }: ContainerProps) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5", className)}>{children}</div>;
}

type ActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: "solid" | "outline" | "ghost" | "light" | "onDark";
  size?: "md" | "lg";
  arrow?: "inline" | "disc";
  pill?: boolean;
  href?: string;
  children: ReactNode;
};

const actionVariants: Record<NonNullable<ActionProps["variant"]>, string> = {
  solid: "bg-action text-action-fg hover:bg-action-hover focus-visible:bg-clay-500",
  outline:
    "border border-border bg-surface text-ink-900 hover:bg-ink-100 focus-visible:bg-focus-tint focus-visible:text-focus-ink",
  ghost:
    "border border-transparent text-ink-900 hover:bg-ink-100 focus-visible:bg-focus-tint focus-visible:text-focus-ink",
  light: "bg-white text-[#1d1b1b] hover:bg-white/85 focus-visible:bg-[#ddb9b9]",
  onDark: "border border-white/25 text-white hover:bg-white/10 focus-visible:bg-white/20",
};

const actionSizes: Record<NonNullable<ActionProps["size"]>, string> = {
  md: "h-9 px-4 text-sm",
  lg: "h-[45px] px-4 text-[15px]",
};

const discSizes: Record<NonNullable<ActionProps["size"]>, string> = {
  md: "h-9 pl-4 pr-1 text-sm",
  lg: "h-[45px] pl-5 pr-1.5 text-[15px]",
};

const discPlates: Record<NonNullable<ActionProps["size"]>, string> = {
  md: "size-7",
  lg: "size-9",
};

export function Action({
  variant = "solid",
  size = "md",
  arrow,
  pill,
  href,
  children,
  className,
  ...rest
}: ActionProps) {
  const classes = cn(
    "group inline-flex shrink-0 items-center gap-2 font-medium",
    pill || arrow === "disc" ? "rounded-full" : "rounded",
    "transition-[color,background-color,border-color,transform] duration-150 ease-out",
    "active:scale-[0.97] motion-reduce:active:scale-[0.99]",
    arrow === "disc" ? discSizes[size] : actionSizes[size],
    actionVariants[variant],
    className,
  );

  const content = (
    <>
      {children}
      {arrow === "inline" ? <ArrowRight className="size-3.5 opacity-70" /> : null}
      {arrow === "disc" ? (
        <span
          aria-hidden
          className={cn(
            "grid place-items-center rounded-full bg-action-fg text-action",
            "transition-transform duration-200 ease-out group-hover:translate-x-0.5",
            "motion-reduce:transition-none motion-reduce:group-hover:translate-x-0",
            discPlates[size],
          )}
        >
          <ArrowRight className="size-3.5 -rotate-45" />
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {content}
    </button>
  );
}

type SectionHeadingProps = {
  lead: string;
  trail?: string;
  className?: string;
};

export function SectionHeading({ lead, trail, className }: SectionHeadingProps) {
  return (
    <h2
      className={cn(
        "max-w-[640px] font-serif text-[30px] leading-[36px] font-normal tracking-[-0.6px] text-balance",
        className,
      )}
    >
      <span className="block text-ink-900">{lead}</span>
      {trail ? <span className="block text-ink-700">{trail}</span> : null}
    </h2>
  );
}

type RailProps = {
  children: ReactNode;
  className?: string;
};

export function Rail({ children, className }: RailProps) {
  return (
    <div className={cn("relative pl-5", className)}>
      <span aria-hidden className="absolute top-1.5 left-0 h-7 w-px bg-ink-900" />
      {children}
    </div>
  );
}

type CarouselNavProps = {
  onPrev: () => void;
  onNext: () => void;
  atStart?: boolean;
  atEnd?: boolean;
};

export function CarouselNav({ onPrev, onNext, atStart, atEnd }: CarouselNavProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous"
        onClick={onPrev}
        disabled={atStart}
        className="focus-soft-tint grid size-9 place-items-center rounded border border-border text-ink-500 transition-colors hover:bg-ink-100 disabled:opacity-35 disabled:hover:bg-transparent"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={onNext}
        disabled={atEnd}
        className="focus-soft-tint grid size-9 place-items-center rounded border border-border text-ink-500 transition-colors hover:bg-ink-100 disabled:opacity-35 disabled:hover:bg-transparent"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

type WordmarkProps = {
  className?: string;
};

export function Wordmark({ className }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
        <g fill="currentColor" transform="translate(0.84 0) skewX(-4)">
          <rect x="4.3" y="6.4" width="4.7" height="12.4" rx="1" />
          <rect x="9.7" y="3.6" width="5" height="17.8" rx="1.2" />
          <rect x="15.4" y="6.4" width="4.7" height="12.4" rx="1" />
        </g>
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.02em]">Skriuw</span>
    </span>
  );
}
