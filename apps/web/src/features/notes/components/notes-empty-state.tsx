"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Waypoints, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type NotesEmptyStateAction =
	| { label: string; href: string; onClick?: never }
	| { label: string; onClick: () => void; href?: never };

export type NotesEmptyStateProps = {
	className?: string;
	icon?: LucideIcon;
	title: string;
	description: ReactNode;
	action?: NotesEmptyStateAction;
};

const actionClassName =
	"inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent";

function NotesEmptyStateAction({ action }: { action: NotesEmptyStateAction }) {
	if (action.href) {
		return (
			<Link href={action.href} className={actionClassName}>
				{action.label}
			</Link>
		);
	}

	return (
		<button type="button" onClick={action.onClick} className={actionClassName}>
			{action.label}
		</button>
	);
}

export function NotesEmptyState({
	className,
	icon: Icon = Waypoints,
	title,
	description,
	action,
}: NotesEmptyStateProps) {
	return (
		<div
			className={cn(
				"flex h-full flex-col items-center justify-center gap-4 p-8 text-center",
				className,
			)}
		>
			<Icon className="h-10 w-10 text-muted-foreground" strokeWidth={1.4} />
			<div className="max-w-md space-y-2">
				<p className="text-sm font-medium text-foreground">{title}</p>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			{action ? <NotesEmptyStateAction action={action} /> : null}
		</div>
	);
}
