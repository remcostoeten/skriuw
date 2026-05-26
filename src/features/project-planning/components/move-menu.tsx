"use client";

import { ArrowLeftRight } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export type Section = "roadmap" | "nice" | "scratch";

const labels: Record<Section, string> = {
	roadmap: "Roadmap",
	nice: "Nice to have",
	scratch: "Scratchpad",
};

type Props = {
	from: Section;
	onMove: (to: Section) => void;
};

export function MoveMenu({ from, onMove }: Props) {
	const targets = (Object.keys(labels) as Section[]).filter((s) => s !== from);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					aria-label="Move to another section"
					className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 md:h-7 md:w-7"
				>
					<ArrowLeftRight className="h-3.5 w-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="bg-sidebar border-border">
				<DropdownMenuLabel className="text-xs text-muted-foreground">
					Move to
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{targets.map((t) => (
					<DropdownMenuItem key={t} onSelect={() => onMove(t)} className="text-sm">
						{labels[t]}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
