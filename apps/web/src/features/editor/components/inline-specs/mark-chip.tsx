"use client";

import { isMarkColor, type MarkColor, type MarkKind } from "@skriuw/domain/living-information";
import { cn } from "@/shared/lib/utils";

const KIND_LABEL: Record<MarkKind, string> = {
	amount: "Amount",
	count: "Count",
	moment: "Moment",
	state: "State",
	person: "Person",
	place: "Place",
	reference: "Reference",
};

const COLOR_CLASS: Record<MarkColor, string> = {
	yellow: "bg-amber-300/35 decoration-amber-700/60 hover:bg-amber-300/55 hover:decoration-amber-800/80 dark:bg-amber-400/20 dark:decoration-amber-300/60 dark:hover:bg-amber-400/30",
	green: "bg-emerald-300/30 decoration-emerald-700/60 hover:bg-emerald-300/50 hover:decoration-emerald-800/80 dark:bg-emerald-400/20 dark:decoration-emerald-300/60 dark:hover:bg-emerald-400/30",
	blue: "bg-sky-300/30 decoration-sky-700/60 hover:bg-sky-300/50 hover:decoration-sky-800/80 dark:bg-sky-400/20 dark:decoration-sky-300/60 dark:hover:bg-sky-400/30",
	pink: "bg-rose-300/30 decoration-rose-700/60 hover:bg-rose-300/50 hover:decoration-rose-800/80 dark:bg-rose-400/20 dark:decoration-rose-300/60 dark:hover:bg-rose-400/30",
	purple: "bg-violet-300/30 decoration-violet-700/60 hover:bg-violet-300/50 hover:decoration-violet-800/80 dark:bg-violet-400/20 dark:decoration-violet-300/60 dark:hover:bg-violet-400/30",
	orange: "bg-orange-300/35 decoration-orange-700/60 hover:bg-orange-300/55 hover:decoration-orange-800/80 dark:bg-orange-400/20 dark:decoration-orange-300/60 dark:hover:bg-orange-400/30",
};

type MarkChipProps = { kind: MarkKind; color: unknown; label: string; text: string };

export function MarkChip({ kind, color, label, text }: MarkChipProps) {
	const resolvedColor = isMarkColor(color) ? color : "yellow";
	const description = [label, KIND_LABEL[kind]].filter(Boolean).join(" · ");
	return (
		<span
			contentEditable={false}
			data-skriuw-mark={kind}
			title={description}
			aria-label={`${text}, ${description}`}
			className={cn(
				"box-decoration-clone rounded-[2px] px-0.5 text-inherit",
				"decoration-1 underline underline-offset-[3px] transition-[background-color,text-decoration-color]",
				COLOR_CLASS[resolvedColor],
			)}
		>
			{text}
		</span>
	);
}
