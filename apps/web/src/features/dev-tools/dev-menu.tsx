"use client";

import { useEffect, useState } from "react";
import { Loader2, Wrench } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/utils";
import { isDevEnv, useDevToolsStore } from "./store";

function DevToggleRow({
	label,
	description,
	checked,
	onCheckedChange,
}: {
	label: string;
	description?: string;
	checked: boolean;
	onCheckedChange: (next: boolean) => void;
}) {
	return (
		<label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-transparent px-2 py-2 transition-colors hover:bg-muted/50">
			<div className="min-w-0 flex-1">
				<div className="text-[12px] font-medium text-foreground/85">{label}</div>
				{description && (
					<div className="mt-0.5 text-[11px] text-muted-foreground/70">{description}</div>
				)}
			</div>
			<Switch checked={checked} onCheckedChange={onCheckedChange} />
		</label>
	);
}

export function DevMenu() {
	const [mounted, setMounted] = useState(false);
	const [open, setOpen] = useState(false);
	const forceLoading = useDevToolsStore((s) => s.forceLoading);
	const setForceLoading = useDevToolsStore((s) => s.setForceLoading);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!isDevEnv() || !mounted) return null;

	return (
		<div className="fixed bottom-3 right-3 z-[60]">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label="Developer tools"
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-full border border-border bg-popover text-popover-foreground/70 shadow-md transition-colors hover:bg-accent hover:text-accent-foreground",
							forceLoading && "ring-1 ring-warning/60 text-warning-foreground",
						)}
					>
						{forceLoading ? (
							<Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.6} />
						) : (
							<Wrench className="h-4 w-4" strokeWidth={1.6} />
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					side="top"
					sideOffset={8}
					className="w-72 p-2"
				>
					<div className="border-b border-border px-2 pb-2 pt-1">
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/68">
							Developer tools
						</div>
					</div>
					<div className="flex flex-col gap-0.5 py-1">
						<DevToggleRow
							label="Force loading state"
							description="Render the workspace loading skeleton continuously."
							checked={forceLoading}
							onCheckedChange={setForceLoading}
						/>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
