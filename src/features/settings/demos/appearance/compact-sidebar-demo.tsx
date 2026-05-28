"use client";

import { FileText } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { DemoFrame } from "../demo-frame";

type CompactSidebarDemoProps = {
	enabled: boolean;
};

function DemoSidebarRow({ compact }: { compact: boolean }) {
	return (
		<div
			className={cn(
				"flex items-center gap-1.5 rounded-sm px-2 text-[10px] text-foreground/88",
				compact ? "h-6" : "h-8",
			)}
		>
			<FileText className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={1.6} />
			<span className="truncate">Weekly review.md</span>
		</div>
	);
}

export function CompactSidebarDemo({ enabled }: CompactSidebarDemoProps) {
	return (
		<DemoFrame title="Preview" status={enabled ? "Compact" : "Comfortable"}>
			<div className="grid grid-cols-2 gap-2">
				<div className="rounded-sm border border-border/60 bg-sidebar/40 p-1.5">
					<div className="mb-1 px-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
						Off
					</div>
					<DemoSidebarRow compact={false} />
					<DemoSidebarRow compact={false} />
				</div>
				<div
					className={cn(
						"rounded-sm border bg-sidebar/40 p-1.5",
						enabled ? "border-foreground/30" : "border-border/60",
					)}
				>
					<div className="mb-1 px-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
						On
					</div>
					<DemoSidebarRow compact />
					<DemoSidebarRow compact />
				</div>
			</div>
		</DemoFrame>
	);
}
