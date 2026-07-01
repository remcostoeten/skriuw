"use client";

import {
	NOTE_PROPERTY_COLOR_KEYS,
	NOTE_PROPERTY_COLORS,
	type NotePropertyColor,
} from "@/domain/notes/properties";
import { cn } from "@/shared/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

type Props = {
	value: NotePropertyColor | null;
	onChange: (color: NotePropertyColor | null) => void;
	label: string;
};

/** A clickable color dot that opens the shared property-color palette. */
export function ColorSwatchPicker({ value, onChange, label }: Props) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Change color for ${label}`}
					className="flex size-6 shrink-0 items-center justify-center rounded-[4px] border border-border/80 transition-colors hover:border-ring/70"
				>
					<span
						className="size-3 rounded-full"
						style={{
							backgroundColor: value
								? NOTE_PROPERTY_COLORS[value].dot
								: "var(--muted-foreground)",
							opacity: value ? 1 : 0.35,
						}}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-2">
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						aria-label="No color"
						onClick={() => onChange(null)}
						className={cn(
							"flex size-6 items-center justify-center rounded-[4px] border transition-colors hover:border-ring/70",
							value === null ? "border-ring" : "border-border/60",
						)}
					>
						<span className="size-3 rounded-full border border-dashed border-muted-foreground/60" />
					</button>
					{(NOTE_PROPERTY_COLOR_KEYS as NotePropertyColor[]).map((color) => (
						<button
							key={color}
							type="button"
							aria-label={`Color ${color}`}
							onClick={() => onChange(color)}
							className={cn(
								"flex size-6 items-center justify-center rounded-[4px] border transition-colors hover:border-ring/70",
								value === color ? "border-ring" : "border-border/60",
							)}
						>
							<span
								className="size-3 rounded-full"
								style={{ backgroundColor: NOTE_PROPERTY_COLORS[color].dot }}
							/>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
