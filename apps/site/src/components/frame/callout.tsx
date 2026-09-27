import type { ReactNode } from "react";
import { cn } from "@skriuw/shared/helpers/cn";

type Tone = "neutral" | "ok" | "accent";

const tones: Record<Tone, string> = {
  neutral: "border-dashed border-line text-ink-500 [--hatch:var(--line)]",
  ok: "border-ok/40 text-ok [--hatch:color-mix(in_srgb,var(--ok)_35%,transparent)]",
  accent: "border-accent/40 text-accent [--hatch:color-mix(in_srgb,var(--accent)_35%,transparent)]",
};

type Props = {
  children: ReactNode;
  tone?: Tone;
  moving?: boolean;
  className?: string;
};

/**
 * Mono strip with a hatched ground running the full width behind the text.
 * `tone` picks the line and text colour; `moving` slides the hatch.
 */
export function Callout({ children, tone = "neutral", moving = true, className }: Props) {
  return (
    <p
      className={cn(
        "caps relative m-0 overflow-hidden rounded-md border px-3 py-2",
        tones[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "hy-hatch absolute inset-0 [mask-image:linear-gradient(to_right,#000_30%,transparent)]",
          moving && "animate-hy-hatch motion-reduce:animate-none",
        )}
      />
      <span className="relative">{children}</span>
    </p>
  );
}
