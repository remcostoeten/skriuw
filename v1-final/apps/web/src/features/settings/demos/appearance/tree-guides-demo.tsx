"use client";

import { Folder, FileText } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { DemoFrame } from "../demo-frame";

type TreeGuidesDemoProps = {
	enabled: boolean;
};

type DemoTreeRowProps = {
	label: string;
	depth: number;
	kind: "folder" | "file";
	showGuides: boolean;
	compact?: boolean;
};

function DemoTreeGuides({ depth, showGuides }: { depth: number; showGuides: boolean }) {
	if (!showGuides || depth <= 0) return null;

	const guideLevels = Array.from({ length: depth }, (_, index) => index);
	const currentGuideLeft = 11 + (depth - 1) * 12;

	return (
		<span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0">
			{guideLevels.map((level) => (
				<span
					key={level}
					className="absolute top-0 bottom-0 w-px bg-border/55"
					style={{ left: `${11 + level * 12}px` }}
				/>
			))}
			<span
				className="absolute h-px w-2 bg-border/55"
				style={{ left: `${currentGuideLeft}px`, top: "50%" }}
			/>
		</span>
	);
}

function DemoTreeRow({ label, depth, kind, showGuides, compact }: DemoTreeRowProps) {
	const Icon = kind === "folder" ? Folder : FileText;

	return (
		<div
			className={cn(
				"relative flex items-center gap-1.5 rounded-sm text-[10px] text-foreground/88",
				compact ? "h-6 px-1.5" : "h-7 px-2",
			)}
			style={{ paddingLeft: `${8 + depth * 12}px` }}
		>
			<DemoTreeGuides depth={depth} showGuides={showGuides} />
			<Icon className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={1.6} />
			<span className="truncate">{label}</span>
		</div>
	);
}

export function TreeGuidesDemo({ enabled }: TreeGuidesDemoProps) {
	return (
		<DemoFrame title="Preview" status={enabled ? "Guides on" : "Guides off"}>
			<div className="rounded-sm border border-border/60 bg-sidebar/40 p-1.5">
				<DemoTreeRow label="Projects" depth={0} kind="folder" showGuides={enabled} />
				<DemoTreeRow label="Research" depth={1} kind="folder" showGuides={enabled} />
				<DemoTreeRow label="Meeting notes.md" depth={2} kind="file" showGuides={enabled} />
				<DemoTreeRow label="Ideas.md" depth={1} kind="file" showGuides={enabled} />
			</div>
		</DemoFrame>
	);
}
