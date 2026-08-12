"use client";

import { useId } from "react";
import type { TViewBucket } from "@/domain/sharing/models";
import { cn } from "@/shared/lib/utils";

type Props = {
	data: TViewBucket[];
	className?: string;
	/** Bar height in px. */
	height?: number;
};

/**
 * Compact bar sparkline of daily views over the recurrence window. Bars scale
 * to the busiest day; empty days render as a faint baseline tick so the cadence
 * (recurrence) reads at a glance.
 */
export function ViewSparkline({ data, className, height = 28 }: Props) {
	const titleId = useId();
	const max = data.reduce((m, b) => Math.max(m, b.count), 0);
	const total = data.reduce((s, b) => s + b.count, 0);

	if (total === 0) {
		return (
			<div
				className={cn("flex items-end gap-px", className)}
				style={{ height }}
				aria-label="No views in this window"
			>
				{data.map((b) => (
					<span
						key={b.date}
						className="flex-1 rounded-[1px] bg-border"
						style={{ height: 2 }}
					/>
				))}
			</div>
		);
	}

	return (
		<div
			className={cn("flex items-end gap-px", className)}
			style={{ height }}
			role="img"
			aria-labelledby={titleId}
		>
			<span id={titleId} className="sr-only">
				{total} views across the window, peak {max} in a day
			</span>
			{data.map((b) => {
				const h = b.count === 0 ? 2 : Math.max(2, Math.round((b.count / max) * height));
				return (
					<span
						key={b.date}
						aria-label={`${b.date}: ${b.count} view${b.count === 1 ? "" : "s"}`}
						className={cn(
							"flex-1 rounded-[1px] transition-colors",
							b.count === 0 ? "bg-border" : "bg-foreground/70 hover:bg-foreground",
						)}
						style={{ height: h }}
					/>
				);
			})}
		</div>
	);
}
