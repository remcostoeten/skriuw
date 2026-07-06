"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, AtSign, Hash, Sparkles, SlashSquare, X, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useFocusTrap } from "@/shared/hooks/use-focus-trap";
import { useOnboardingStore } from "../store";

type SlashRow = { label: string; hint: string };

type WalkthroughStep = {
	id: string;
	icon: LucideIcon;
	title: string;
	body: string;
	visual: "welcome" | "slash" | "mention" | "tag";
};

const STEPS: WalkthroughStep[] = [
	{
		id: "welcome",
		icon: Sparkles,
		title: "Welcome to Skriuw",
		body: "A calm place to write and connect your notes. Here's a 20-second tour of the three keys that do the most work.",
		visual: "welcome",
	},
	{
		id: "slash",
		icon: SlashSquare,
		title: "Type / to add anything",
		body: "On a new line, press the / key. A menu opens with headings, lists, checkboxes, code, tables and more — arrow keys and Enter, or just click.",
		visual: "slash",
	},
	{
		id: "mention",
		icon: AtSign,
		title: "Type @ to link a note",
		body: "Press @ and pick a note to link it — or type a new name to create and link it in one step. This is how notes connect.",
		visual: "mention",
	},
	{
		id: "tag",
		icon: Hash,
		title: "Type # to tag",
		body: "Press # and add a label like #ideas or #todo. Tags group related notes so you can find them again fast.",
		visual: "tag",
	},
];

const SLASH_ROWS: SlashRow[] = [
	{ label: "Heading", hint: "Big title" },
	{ label: "Check list", hint: "To-dos" },
	{ label: "Code block", hint: "Snippets" },
	{ label: "File tree", hint: "File map" },
];

function StepVisual({ visual }: { visual: WalkthroughStep["visual"] }) {
	const reduceMotion = useReducedMotion();
	const rise = reduceMotion
		? {}
		: { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } };

	if (visual === "welcome") {
		return (
			<div className="flex items-center justify-center gap-3">
				{[SlashSquare, AtSign, Hash].map((Icon, i) => (
					<motion.div
						key={i}
						initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{
							delay: 0.08 * i,
							type: "spring",
							stiffness: 320,
							damping: 22,
						}}
						className="flex size-12 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-sm"
					>
						<Icon className="size-5" />
					</motion.div>
				))}
			</div>
		);
	}

	if (visual === "slash") {
		return (
			<div className="space-y-2 rounded-lg border border-border bg-background p-3 text-left">
				<div className="font-mono text-sm text-foreground/80">
					/
					<span className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-primary" />
				</div>
				<div className="overflow-hidden rounded-md border border-border bg-popover p-1">
					{SLASH_ROWS.map((row, i) => (
						<motion.div
							key={row.label}
							{...rise}
							transition={{ delay: 0.06 * i }}
							className={cn(
								"flex items-center justify-between rounded px-2 py-1.5 text-xs",
								i === 0
									? "bg-accent text-accent-foreground"
									: "text-popover-foreground",
							)}
						>
							<span className="font-medium">{row.label}</span>
							<span className="text-[10px] text-muted-foreground">{row.hint}</span>
						</motion.div>
					))}
				</div>
			</div>
		);
	}

	if (visual === "mention") {
		return (
			<div className="space-y-2 rounded-lg border border-border bg-background p-3 text-left">
				<div className="font-mono text-sm text-foreground/80">
					See also <span className="text-primary">@</span>weekly
				</div>
				<div className="overflow-hidden rounded-md border border-border bg-popover p-1">
					{["Weekly review", "Weekly goals"].map((label, i) => (
						<motion.div
							key={label}
							{...rise}
							transition={{ delay: 0.06 * i }}
							className={cn(
								"flex items-center gap-2 rounded px-2 py-1.5 text-xs",
								i === 0
									? "bg-accent text-accent-foreground"
									: "text-popover-foreground",
							)}
						>
							<AtSign className="size-3 text-muted-foreground" />
							<span className="font-medium">{label}</span>
						</motion.div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-2 rounded-lg border border-border bg-background p-3 text-left">
			<div className="font-mono text-sm text-foreground/80">Captured today</div>
			<div className="flex flex-wrap gap-1.5">
				{["#ideas", "#todo", "#reading"].map((tag, i) => (
					<motion.span
						key={tag}
						{...rise}
						transition={{ delay: 0.07 * i }}
						className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
					>
						{tag}
					</motion.span>
				))}
			</div>
		</div>
	);
}

export function WelcomeWalkthrough() {
	const hasSeenWelcome = useOnboardingStore((s) => s.hasSeenWelcome);
	const hydrated = useOnboardingStore((s) => s.hydrated);
	const dismissWelcome = useOnboardingStore((s) => s.dismissWelcome);
	const reduceMotion = useReducedMotion();
	const cardRef = useRef<HTMLDivElement>(null);
	const [stepIndex, setStepIndex] = useState(0);

	const open = hydrated && !hasSeenWelcome;
	useFocusTrap(open, cardRef);

	const close = useCallback(() => {
		dismissWelcome();
	}, [dismissWelcome]);

	const step = STEPS[stepIndex];
	const isLast = stepIndex === STEPS.length - 1;

	const goNext = useCallback(() => {
		if (isLast) {
			close();
			return;
		}
		setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
	}, [isLast, close]);

	const goBack = useCallback(() => {
		setStepIndex((i) => Math.max(i - 1, 0));
	}, []);

	useEffect(() => {
		if (!open) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			} else if (event.key === "ArrowRight") {
				event.preventDefault();
				goNext();
			} else if (event.key === "ArrowLeft") {
				event.preventDefault();
				goBack();
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, close, goNext, goBack]);

	if (!open || !step) return null;

	const StepIcon = step.icon;

	return (
		<AnimatePresence>
			<motion.div
				key="welcome-walkthrough"
				initial={reduceMotion ? false : { opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				className="fixed inset-0 z-[200] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
				onMouseDown={(event) => {
					if (event.target === event.currentTarget) close();
				}}
			>
				<motion.div
					ref={cardRef}
					role="dialog"
					aria-modal="true"
					aria-labelledby="welcome-walkthrough-title"
					initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
					transition={{ type: "spring", stiffness: 280, damping: 26 }}
					className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
				>
					<button
						type="button"
						onClick={close}
						aria-label="Skip tour"
						className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						<X className="size-4" />
					</button>

					<div className="px-6 pb-2 pt-6">
						<div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<StepIcon className="size-5" />
						</div>
					</div>

					<div className="px-6">
						<AnimatePresence mode="wait">
							<motion.div
								key={step.id}
								initial={reduceMotion ? false : { opacity: 0, x: 16 }}
								animate={{ opacity: 1, x: 0 }}
								exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -16 }}
								transition={{ duration: 0.2 }}
							>
								<h2
									id="welcome-walkthrough-title"
									className="text-lg font-semibold tracking-tight"
								>
									{step.title}
								</h2>
								<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
									{step.body}
								</p>
								<div className="mt-4">
									<StepVisual visual={step.visual} />
								</div>
							</motion.div>
						</AnimatePresence>
					</div>

					<div className="mt-6 flex items-center justify-between gap-3 border-t border-border px-6 py-3">
						<div className="flex items-center gap-1.5" aria-hidden>
							{STEPS.map((s, i) => (
								<span
									key={s.id}
									className={cn(
										"h-1.5 rounded-full transition-all",
										i === stepIndex ? "w-5 bg-primary" : "w-1.5 bg-border",
									)}
								/>
							))}
						</div>

						<div className="flex items-center gap-2">
							{stepIndex > 0 && (
								<button
									type="button"
									onClick={goBack}
									className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								>
									<ArrowLeft className="size-3.5" />
									Back
								</button>
							)}
							<button
								type="button"
								onClick={goNext}
								className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							>
								{isLast ? "Start writing" : "Next"}
							</button>
						</div>
					</div>
				</motion.div>
			</motion.div>
		</AnimatePresence>
	);
}
