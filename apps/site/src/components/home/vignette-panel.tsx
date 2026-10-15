import type { CSSProperties, ReactNode } from "react";
import { cn } from "@skriuw/shared/helpers/cn";

type Props = {
  children: ReactNode;
  className?: string;
};

export function vars(values: Record<string, string | number>) {
  return values as CSSProperties;
}

export function Panel({ children, className }: Props) {
  return (
    <div
      className={cn(
        "vg-panel h-full w-full rounded-tl-[10px] border-t border-l border-border bg-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}
