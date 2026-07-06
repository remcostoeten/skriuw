"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface Option {
	value: string;
	label: string;
	description?: string;
}

interface Props {
	value: string;
	options: Option[];
	onValueChange: (value: string) => void;
	className?: string;
	align?: "start" | "end";
}

export function PlainSelect({ value, options, onValueChange, className, align = "start" }: Props) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const selected = options.find((option) => option.value === value);

	useEffect(() => {
		if (!open) {
			return;
		}
		function handlePointerDown(event: PointerEvent) {
			if (!rootRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		}
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setOpen(false);
			}
		}
		window.addEventListener("pointerdown", handlePointerDown, true);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown, true);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [open]);

	return (
		<div ref={rootRef} className={cn("relative", className)}>
			<button
				type="button"
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={() => setOpen((prev) => !prev)}
				className={cn(
					"flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors",
					"hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
					open && "ring-2 ring-ring ring-offset-2",
				)}
			>
				<span className="truncate">{selected?.label ?? "Select…"}</span>
				<ChevronDown
					className={cn(
						"h-4 w-4 shrink-0 opacity-50 transition-transform duration-200",
						open && "rotate-180",
					)}
				/>
			</button>

			{open ? (
				<div
					role="listbox"
					className={cn(
						"absolute z-50 mt-1.5 min-w-full overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg",
						"animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150",
						align === "end" ? "right-0" : "left-0",
					)}
				>
					{options.map((option) => {
						const isActive = option.value === value;
						return (
							<button
								key={option.value}
								type="button"
								role="option"
								aria-selected={isActive}
								onClick={() => {
									onValueChange(option.value);
									setOpen(false);
								}}
								className={cn(
									"flex w-full items-start gap-2 rounded-sm px-2.5 py-2 text-left text-sm transition-colors",
									"hover:bg-accent hover:text-accent-foreground",
									isActive && "bg-accent/60",
								)}
							>
								<Check
									className={cn(
										"mt-0.5 h-4 w-4 shrink-0 transition-opacity",
										isActive ? "opacity-100" : "opacity-0",
									)}
								/>
								<span className="flex flex-col">
									<span className="leading-tight">{option.label}</span>
									{option.description ? (
										<span className="text-xs text-muted-foreground">
											{option.description}
										</span>
									) : null}
								</span>
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
