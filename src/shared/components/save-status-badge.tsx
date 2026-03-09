"use client";

import { cn } from "@/shared/lib/utils";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  status?: SaveStatus;
  className?: string;
};

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: "Idle",
  saving: "Saving...",
  saved: "Saved",
  error: "Save failed",
};

export function SaveStatusBadge({ status = "idle", className }: Props) {
  if (status === "idle") {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm",
        status === "saving" && "border-border/70 bg-card/85 text-muted-foreground",
        status === "saved" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        status === "error" && "border-red-500/20 bg-red-500/10 text-red-400",
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "saving" && "animate-pulse bg-muted-foreground",
          status === "saved" && "bg-emerald-400",
          status === "error" && "bg-red-400",
        )}
      />
      <span>{SAVE_STATUS_LABELS[status]}</span>
    </div>
  );
}
