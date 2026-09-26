import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Props = {
  /** Expands or collapses the content with a height transition. */
  open: boolean;
  /** Content to reveal. */
  children: ReactNode;
  /** Extra class on the wrapper. */
  className?: string;
};

/**
 * Animates a bounded region between collapsed and expanded without the caller
 * measuring anything: the outer grid transitions its single row between `0fr`
 * and `1fr`. Collapsed content stays mounted — so the close animates too — but
 * is made inert so it cannot be focused or announced.
 *
 * Only use this where the expanded height is bounded (a capped scroller, a
 * short list). An unbounded region makes the transition span an arbitrary
 * distance and read as slow.
 */
export function Collapse({ open, children, className }: Props) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className,
      )}
    >
      <div
        inert={!open}
        className={cn(
          "overflow-hidden transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}
