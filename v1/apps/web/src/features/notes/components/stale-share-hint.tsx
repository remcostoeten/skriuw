"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type StaleShareHintProps = {
	onRefresh: () => void;
	isRefreshing?: boolean;
	className?: string;
	layout?: "inline" | "banner";
};

export function StaleShareHint({
	onRefresh,
	isRefreshing = false,
	className,
	layout = "inline",
}: StaleShareHintProps) {
	if (layout === "banner") {
		return (
			<div
				className={cn(
					"border-b border-foreground/8 px-4 py-3 text-[12px] leading-5 text-amber-700 dark:text-amber-500",
					className,
				)}
			>
				<p>Public link shows an older snapshot.</p>
				<button
					type="button"
					disabled={isRefreshing}
					onClick={onRefresh}
					className="pressable mt-2 inline-flex items-center gap-1.5 font-medium text-amber-800 underline-offset-2 hover:underline disabled:opacity-50 dark:text-amber-400"
				>
					{isRefreshing ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<RefreshCw className="h-3.5 w-3.5" />
					)}
					Refresh link
				</button>
			</div>
		);
	}

	return (
		<div className={cn("flex w-full flex-col items-end gap-1", className)}>
			<p className="max-w-[180px] text-right text-[12px] leading-5 text-amber-700 dark:text-amber-500">
				Public link shows an older snapshot.
			</p>
			<button
				type="button"
				disabled={isRefreshing}
				onClick={onRefresh}
				className="pressable inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-amber-800 underline-offset-2 hover:underline disabled:opacity-50 dark:text-amber-400"
			>
				{isRefreshing ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
				) : (
					<RefreshCw className="h-3.5 w-3.5" />
				)}
				Refresh link
			</button>
		</div>
	);
}
