import { Children, cloneElement, isValidElement, useId, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { settingsAnchorProps } from "@/features/settings/lib/settings-focus-anchor";

export function SectionHeader({ title, description }: { title: string; description: string }) {
	return (
		<header className="mb-8">
			<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
			<p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
		</header>
	);
}

export function Row({
	title,
	description,
	visualization,
	children,
	disabled,
	focusId,
}: {
	title: string;
	description?: string;
	visualization?: ReactNode;
	children: ReactNode;
	disabled?: boolean;
	focusId?: string;
}) {
	const anchor = focusId ? settingsAnchorProps(focusId) : null;
	const titleId = useId();
	const descriptionId = description ? `${titleId}-description` : undefined;
	// Wire the row's title/description to the control as its accessible name,
	// so screen readers announce "Compact sidebar, switch" instead of "switch".
	const labelledChildren = Children.map(children, (child) => {
		if (!isValidElement(child)) return child;
		const props = child.props as Record<string, unknown>;
		if (props["aria-label"] || props["aria-labelledby"]) return child;
		return cloneElement(child, {
			"aria-labelledby": titleId,
			"aria-describedby": props["aria-describedby"] ?? descriptionId,
		} as Record<string, unknown>);
	});
	return (
		<div
			{...anchor}
			className={cn(
				"flex items-start justify-between gap-6 py-4",
				anchor?.className,
				disabled && "opacity-50",
			)}
		>
			<div className="min-w-0 flex-1">
				<div id={titleId} className="text-sm font-medium">
					{title}
				</div>
				{description && (
					<div id={descriptionId} className="mt-0.5 text-xs text-muted-foreground">
						{description}
					</div>
				)}
				{visualization ? <div className="mt-3">{visualization}</div> : null}
			</div>
			<div className="shrink-0">{labelledChildren}</div>
		</div>
	);
}

export function SettingsCard({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-lg border border-border/60 bg-card/40 px-5 divide-y divide-border/50">
			{children}
		</div>
	);
}

export function GroupLabel({ children, focusId }: { children: ReactNode; focusId?: string }) {
	const anchor = focusId ? settingsAnchorProps(focusId) : null;
	return (
		<div
			{...anchor}
			className={cn(
				"mb-2 mt-8 px-1 text-[10px] font-medium tracking-[0.14em] text-muted-foreground",
				anchor?.className,
			)}
		>
			{children}
		</div>
	);
}
