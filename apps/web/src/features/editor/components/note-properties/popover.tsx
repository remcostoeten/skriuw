"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type NotePropertiesPopoverProps = {
	trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
	children: (props: { close: () => void }) => ReactNode;
	align?: "start" | "end";
	className?: string;
	wrapperClassName?: string;
};

export function NotePropertiesPopover({
	trigger,
	children,
	align = "start",
	className,
	wrapperClassName,
}: NotePropertiesPopoverProps) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const prefersReducedMotion = useReducedMotion();
	const previouslyFocused = useRef<Element | null>(null);

	const close = useCallback(() => setOpen(false), []);

	useEffect(() => {
		if (!open) {
			if (previouslyFocused.current instanceof HTMLElement) {
				previouslyFocused.current.focus();
			}
			previouslyFocused.current = null;
			return;
		}

		previouslyFocused.current = document.activeElement;

		requestAnimationFrame(() => {
			const content = ref.current?.querySelector<HTMLElement>("[data-popover-content]");
			if (!content) return;
			const first = content.querySelector<HTMLElement>(FOCUSABLE);
			first?.focus();
		});
	}, [open]);

	useEffect(() => {
		if (!open) return;

		function onDown(event: MouseEvent) {
			if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
		}

		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setOpen(false);
				return;
			}

			if (event.key !== "Tab") return;

			const content = ref.current?.querySelector<HTMLElement>("[data-popover-content]");
			if (!content) return;

			const focusable = content.querySelectorAll<HTMLElement>(FOCUSABLE);
			if (focusable.length === 0) return;

			const first = focusable[0]!;
			const last = focusable[focusable.length - 1]!;

			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);

		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div ref={ref} className={cn("relative inline-flex", wrapperClassName)}>
			{trigger({ open, toggle: () => setOpen((value) => !value) })}
			<AnimatePresence>
				{open ? (
					<motion.div
						initial={
							prefersReducedMotion
								? { opacity: 0 }
								: { opacity: 0, scale: 0.96, y: -4 }
						}
						animate={
							prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
						}
						exit={
							prefersReducedMotion
								? { opacity: 0 }
								: { opacity: 0, scale: 0.98, y: -2 }
						}
						transition={{
							duration: prefersReducedMotion ? 0.1 : 0.15,
							ease: [0.16, 1, 0.3, 1],
						}}
						className={cn(
							"absolute top-[calc(100%+6px)] z-50 origin-top-left will-change-[opacity,transform]",
							align === "end" ? "right-0 origin-top-right" : "left-0",
							className,
						)}
					>
						<div
							data-popover-content
							className="rounded-lg border border-border bg-popover text-popover-foreground shadow-xl shadow-black/40"
						>
							{children({ close })}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
