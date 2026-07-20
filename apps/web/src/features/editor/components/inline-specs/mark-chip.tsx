"use client";

import {
	defaultColorForKind,
	isMarkColor,
	MARK_COLORS,
	MARK_KINDS,
	type MarkColor,
	type MarkKind,
} from "@skriuw/domain/living-information";
import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

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

type MarkChipProps = {
	id: string;
	kind: MarkKind;
	color: unknown;
	label: string;
	thread: string;
	text: string;
	onUpdate?: (update: {
		text: string;
		value: string;
		kind: MarkKind;
		color: MarkColor;
		label: string;
		thread: string;
	}) => void;
	onUnmark?: () => void;
};

export function MarkChip({
	id,
	kind,
	color,
	label,
	thread,
	text,
	onUpdate,
	onUnmark,
}: MarkChipProps) {
	const resolvedColor = isMarkColor(color) ? color : "yellow";
	const description = [thread, label, KIND_LABEL[kind]].filter(Boolean).join(" · ");
	const [open, setOpen] = useState(false);
	const [draftKind, setDraftKind] = useState(kind);
	const [draftText, setDraftText] = useState(text);
	const [draftColor, setDraftColor] = useState(resolvedColor);
	const [draftLabel, setDraftLabel] = useState(label);
	const [draftThread, setDraftThread] = useState(thread);

	useEffect(() => {
		if (open) return;
		setDraftKind(kind);
		setDraftText(text);
		setDraftColor(resolvedColor);
		setDraftLabel(label);
		setDraftThread(thread);
	}, [kind, label, open, resolvedColor, text, thread]);

	const save = () => {
		onUpdate?.({
			text: draftText.trim() || text,
			value: draftText.trim() || text,
			kind: draftKind,
			color: draftColor,
			label: draftLabel.trim(),
			thread: draftThread.trim(),
		});
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					contentEditable={false}
					data-skriuw-mark={kind}
					data-skriuw-mark-id={id}
					title={description}
					aria-label={`${text}, ${description}. Edit Mark`}
					onMouseDown={(event) => event.stopPropagation()}
					className={cn(
						"box-decoration-clone rounded-[2px] border-0 px-0.5 font-inherit text-inherit",
						"decoration-1 underline underline-offset-[3px] transition-[background-color,text-decoration-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						COLOR_CLASS[resolvedColor],
					)}
				>
					{text}
				</button>
			</PopoverTrigger>
			<PopoverContent
				role="dialog"
				aria-label={`Edit Mark: ${text}`}
				align="start"
				className="w-72 space-y-3 p-3"
			>
				<label className="grid gap-1 text-xs font-medium">
					Text
					<input
						value={draftText}
						onChange={(event) => setDraftText(event.target.value)}
						className="h-9 border border-input bg-background px-2 text-sm"
					/>
				</label>
				<label className="grid gap-1 text-xs font-medium">
					Meaning
					<select
						value={draftKind}
						onChange={(event) => {
							const nextKind = event.target.value as MarkKind;
							setDraftKind(nextKind);
							setDraftColor(defaultColorForKind(nextKind));
						}}
						className="h-9 border border-input bg-background px-2 text-sm"
					>
						{MARK_KINDS.map((option) => (
							<option key={option} value={option}>
								{KIND_LABEL[option]}
							</option>
						))}
					</select>
				</label>
				<fieldset>
					<legend className="mb-1 text-xs font-medium">Color</legend>
					<div className="flex gap-1.5">
						{MARK_COLORS.map((option) => (
							<button
								key={option}
								type="button"
								aria-label={`${option} Mark color`}
								aria-pressed={draftColor === option}
								onClick={() => setDraftColor(option)}
								className={cn(
									"size-7 rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									COLOR_CLASS[option],
									draftColor === option &&
										"ring-2 ring-ring ring-offset-2 ring-offset-popover",
								)}
							/>
						))}
					</div>
				</fieldset>
				<label className="grid gap-1 text-xs font-medium">
					Thread
					<input
						value={draftThread}
						onChange={(event) => setDraftThread(event.target.value)}
						placeholder="Optional group name"
						className="h-9 border border-input bg-background px-2 text-sm"
					/>
				</label>
				<label className="grid gap-1 text-xs font-medium">
					Note
					<input
						value={draftLabel}
						onChange={(event) => setDraftLabel(event.target.value)}
						placeholder="Optional context"
						className="h-9 border border-input bg-background px-2 text-sm"
						onKeyDown={(event) => {
							if (event.key === "Enter") save();
						}}
					/>
				</label>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="mr-auto h-8 px-2 text-xs text-destructive"
						onClick={() => {
							onUnmark?.();
							setOpen(false);
						}}
					>
						Convert to text
					</button>
					<button
						type="button"
						className="h-8 px-2 text-xs text-muted-foreground"
						onClick={() => setOpen(false)}
					>
						Cancel
					</button>
					<button
						type="button"
						className="h-8 bg-primary px-3 text-xs font-medium text-primary-foreground"
						onClick={save}
					>
						Save Mark
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
