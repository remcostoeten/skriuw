import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../shared/lib/utils";

type Props = {
  trigger: (api: { toggle: () => void; open: boolean }) => ReactNode;
  children: (api: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  className?: string;
};

export function PropertyPopover({ trigger, children, align = "start", className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {trigger({ toggle: () => setOpen((current) => !current), open })}
      {open && (
        <div
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "motion-reduce:animate-none",
            align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}
