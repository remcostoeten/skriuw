"use client";

import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";

export const NOTE_COVER_GRADIENTS: Record<string, string> = {
	sunset: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
	dusk: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
	ocean: "linear-gradient(135deg, #2e3192 0%, #1bffff 100%)",
	forest: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)",
	blossom: "linear-gradient(135deg, #ee9ca7 0%, #ffdde1 100%)",
	ember: "linear-gradient(135deg, #cb2d3e 0%, #ef473a 100%)",
	midnight: "linear-gradient(135deg, #232526 0%, #414345 100%)",
	aurora: "linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%)",
	sand: "linear-gradient(135deg, #c79081 0%, #dfa579 100%)",
	violet: "linear-gradient(135deg, #41295a 0%, #2f0743 100%)",
};

const GRADIENT_PREFIX = "gradient:";

export function resolveCoverStyle(cover: string): React.CSSProperties {
	if (cover.startsWith(GRADIENT_PREFIX)) {
		const gradient = NOTE_COVER_GRADIENTS[cover.slice(GRADIENT_PREFIX.length)];
		return { backgroundImage: gradient ?? NOTE_COVER_GRADIENTS.midnight };
	}
	return {
		backgroundImage: `url(${JSON.stringify(cover)})`,
		backgroundSize: "cover",
		backgroundPosition: "center",
	};
}

export function NoteCoverBanner({ cover }: { cover: string }) {
	return (
		<div
			aria-hidden
			className="h-32 w-full shrink-0 md:h-40"
			style={resolveCoverStyle(cover)}
		/>
	);
}

type PickerProps = {
	cover?: string;
	onCoverChange: (cover: string) => void;
};

export function NoteCoverPicker({ cover, onCoverChange }: PickerProps) {
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");

	function applyUrl() {
		const trimmed = url.trim();
		if (!trimmed) return;
		onCoverChange(trimmed);
		setUrl("");
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex h-8 w-8 items-center justify-center rounded-md transition-colors",
						cover
							? "hover:bg-accent"
							: "text-muted-foreground hover:bg-accent hover:text-foreground",
					)}
					aria-label={cover ? "Change cover" : "Add cover"}
				>
					{cover ? (
						<span
							className="h-4 w-6 rounded-sm border border-border"
							style={resolveCoverStyle(cover)}
						/>
					) : (
						<ImageIcon className="h-4 w-4" />
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-[248px] p-2" align="start" side="right">
				<div className="grid grid-cols-5 gap-1.5">
					{Object.entries(NOTE_COVER_GRADIENTS).map(([id, gradient]) => {
						const value = `${GRADIENT_PREFIX}${id}`;
						return (
							<button
								key={id}
								type="button"
								title={id}
								onClick={() => {
									onCoverChange(value);
									setOpen(false);
								}}
								className={cn(
									"h-8 rounded-md border transition-transform hover:scale-105",
									cover === value ? "border-ring" : "border-border",
								)}
								style={{ backgroundImage: gradient }}
							/>
						);
					})}
				</div>
				<div className="mt-2 flex items-center gap-1.5">
					<input
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") applyUrl();
						}}
						placeholder="Paste image URL…"
						className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:border-ring"
					/>
					<button
						type="button"
						onClick={applyUrl}
						disabled={!url.trim()}
						className="h-7 shrink-0 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
					>
						Set
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
