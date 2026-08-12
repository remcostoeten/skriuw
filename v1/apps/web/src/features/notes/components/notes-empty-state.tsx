"use client";

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Waypoints, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-mobile";

type NotesEmptyStateAction = { label: string; kbd?: string } & (
	| { href: string; onClick?: never }
	| { onClick: () => void; href?: never }
);

export type NotesEmptyStateProps = {
	className?: string;
	icon?: LucideIcon;
	title: string;
	description: ReactNode;
	action?: NotesEmptyStateAction;
};

const actionClassName =
	"inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent";

function ActionKbd({ kbd }: { kbd: string }) {
	const isMobile = useIsMobile();
	if (isMobile) return null;

	return (
		<kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground">
			{kbd}
		</kbd>
	);
}

function NotesEmptyStateAction({ action }: { action: NotesEmptyStateAction }) {
	const content = (
		<>
			{action.label}
			{action.kbd ? <ActionKbd kbd={action.kbd} /> : null}
		</>
	);

	if (action.href) {
		return (
			<Link href={action.href} className={actionClassName}>
				{content}
			</Link>
		);
	}

	return (
		<button type="button" onClick={action.onClick} className={actionClassName}>
			{content}
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
