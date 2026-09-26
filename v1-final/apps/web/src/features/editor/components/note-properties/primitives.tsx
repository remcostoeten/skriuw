"use client";

import { NOTE_PROPERTY_COLORS, type NotePropertyColor } from "@/domain/notes/properties";

export function Pill({
	label,
	color,
	onRemove,
	dot = false,
}: {
	label: string;
	color: NotePropertyColor;
	onRemove?: () => void;
	dot?: boolean;
}) {
	const palette = NOTE_PROPERTY_COLORS[color];
	return (
		<span
			className="inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-medium leading-5"
			style={{ backgroundColor: palette.bg, color: palette.fg }}
		>
			{dot ? (
				<span
					className="size-1.5 shrink-0 rounded-full"
					style={{ backgroundColor: palette.dot }}
					aria-hidden
				/>
			) : null}
			<span className="truncate">{label}</span>
			{onRemove ? (
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onRemove();
					}}
					className="-mr-0.5 ml-0.5 rounded-sm opacity-60 transition-opacity hover:opacity-100"
					aria-label={`Remove ${label}`}
				>
					<svg
						viewBox="0 0 16 16"
						className="size-3"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
					</svg>
				</button>
			) : null}
		</span>
	);
}

export function Avatar({
	name,
	color,
	size = 18,
}: {
	name: string;
	color: NotePropertyColor;
	size?: number;
}) {
	const palette = NOTE_PROPERTY_COLORS[color];
	const initials = name
		.split(" ")
		.map((word) => word[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
			style={{
				width: size,
				height: size,
				backgroundColor: palette.dot,
				color: "oklch(0.2 0 0)",
				fontSize: size * 0.42,
			}}
			aria-hidden
		>
			{initials}
		</span>
	);
}
