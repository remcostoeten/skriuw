"use client";

import { cn } from "@/shared/lib/utils";

type DemoFrameProps = {
  title: string;
  status: string;
  children: React.ReactNode;
  className?: string;
};

export function DemoFrame({ title, status, children, className }: DemoFrameProps) {
  return (
    <div className={cn("w-full max-w-[22rem] overflow-hidden", className)}>
      <div className="flex items-center justify-between px-0.5 pb-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </span>
        <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {status}
        </span>
      </div>
      <div className="overflow-hidden rounded-md bg-background/55 p-3">{children}</div>
    </div>
  );
}
