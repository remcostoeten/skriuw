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
		danger: "border-destructive/30 text-destructive bg-destructive/10",
		success: "border-success/30 text-success bg-success/10",
		warn: "border-warning/30 text-warning bg-warning/10",
		info: "border-info/30 text-info bg-info/10",
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
