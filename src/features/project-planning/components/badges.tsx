import type { FeatureStatus, IssueStatus, Priority, ScratchType } from "../types";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "default" | "muted" | "accent" | "danger" | "success" | "warn" | "info";
};

export function Badge({ children, tone = "default" }: BadgeProps) {
  const toneClass: Record<NonNullable<BadgeProps["tone"]>, string> = {
    default: "border-border text-foreground/80",
    muted: "border-border text-muted-foreground",
    accent: "border-border text-foreground bg-accent",
    danger: "border-red-500/30 text-red-300 bg-red-500/10",
    success: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10",
    warn: "border-amber-500/30 text-amber-300 bg-amber-500/10",
    info: "border-blue-500/30 text-blue-300 bg-blue-500/10",
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

const featureTone: Record<FeatureStatus, BadgeProps["tone"]> = {
  in_progress: "info",
  planned: "accent",
  exploring: "warn",
  blocked: "danger",
  completed: "success",
  archived: "muted",
};

const issueTone: Record<IssueStatus, BadgeProps["tone"]> = {
  todo: "muted",
  in_progress: "info",
  blocked: "danger",
  done: "success",
};

const priorityTone: Record<Priority, BadgeProps["tone"]> = {
  low: "muted",
  medium: "default",
  high: "warn",
  critical: "danger",
};

export function FeatureStatusBadge({ status }: { status: FeatureStatus }) {
  return <Badge tone={featureTone[status]}>{status.replace("_", " ")}</Badge>;
}

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return <Badge tone={issueTone[status]}>{status.replace("_", " ")}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={priorityTone[priority]}>{priority}</Badge>;
}

export function ScratchTypeBadge({ type }: { type: ScratchType }) {
  return <Badge tone="muted">{type}</Badge>;
}
