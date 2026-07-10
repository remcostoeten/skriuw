"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { domAnimation, LazyMotion, m, useReducedMotion } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import { useCommandRegistry } from "@/core/commands";
import { useShortcutHint } from "@/core/shortcuts";
import {
	isTauriRuntime,
	useIsGuestWorkspace,
	useWorkspaceCapabilities,
} from "@/core/workspace-backend";
import { openAuthDrawer } from "@/features/layout/components/open-auth-drawer";
import { openSettings, useSettingsModal } from "@/features/settings/use-settings-modal";
import { useFocusTrap } from "@/shared/hooks/use-focus-trap";
import { cn } from "@/shared/lib/utils";
import { TOUR_STEPS, type TourEffects, type TourStep, type TourStepContext } from "../tour-steps";
import { useTourStore } from "../store";
import type { CSSProperties, RefObject } from "react";
import type { ShortcutId } from "@/core/shortcuts/registry";

const TOOLTIP_WIDTH = 380;
const TOOLTIP_EST_HEIGHT = 240;
const ANCHOR_GAP = 14;
const VIEWPORT_PAD = 12;
const RING_PAD = 6;

type AnchorBox = { top: number; left: number; width: number; height: number };

function useAnchorRect(selector: string | undefined, stepId: string): AnchorBox | null {
	const [rect, setRect] = useState<AnchorBox | null>(null);

	useEffect(() => {
		if (!selector) {
			setRect(null);
			return;
		}
		const found = document.querySelector(selector);
		if (!(found instanceof HTMLElement)) {
			setRect(null);
			return;
		}
		const el: HTMLElement = found;
		el.scrollIntoView({ block: "nearest", inline: "nearest" });

		function measure() {
			const r = el.getBoundingClientRect();
			setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
		}
		measure();

		const observer = new ResizeObserver(() => measure());
		observer.observe(el);
		observer.observe(document.documentElement);
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", measure);
			window.removeEventListener("scroll", measure, true);
		};
	}, [selector, stepId]);

	return rect;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function tooltipStyleFor(rect: AnchorBox): CSSProperties {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const left = clamp(
		rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2,
		VIEWPORT_PAD,
		Math.max(VIEWPORT_PAD, vw - TOOLTIP_WIDTH - VIEWPORT_PAD),
	);
	const fitsBelow = rect.top + rect.height + ANCHOR_GAP + TOOLTIP_EST_HEIGHT < vh;
	if (fitsBelow) {
		return {
			position: "fixed",
			left,
			top: rect.top + rect.height + ANCHOR_GAP,
		};
	}
	const fitsAbove = rect.top - ANCHOR_GAP - TOOLTIP_EST_HEIGHT > 0;
	if (fitsAbove) {
		return { position: "fixed", left, bottom: vh - rect.top + ANCHOR_GAP };
	}
	const fitsRight = rect.left + rect.width + ANCHOR_GAP + TOOLTIP_WIDTH < vw;
	return {
		position: "fixed",
		top: clamp(rect.top, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, vh - TOOLTIP_EST_HEIGHT)),
		left: fitsRight
			? rect.left + rect.width + ANCHOR_GAP
			: Math.max(VIEWPORT_PAD, rect.left - ANCHOR_GAP - TOOLTIP_WIDTH),
	};
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

function ShortcutChip({ id }: { id: ShortcutId }) {
	const hint = useShortcutHint(id);
	if (!hint) return null;
	return (
		<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
			{hint}
		</kbd>
	);
}

type TourCardProps = {
	step: TourStep;
	index: number;
	total: number;
	isLast: boolean;
	fx: TourEffects;
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
	cardRef: RefObject<HTMLDivElement | null>;
	style?: CSSProperties;
	className?: string;
};

function TourCard({
	step,
	index,
	total,
	isLast,
	fx,
	onNext,
	onBack,
	onSkip,
	cardRef,
	style,
	className,
}: TourCardProps) {
	const reduceMotion = useReducedMotion();
	const Demo = step.demo;

	return (
		<m.div
			ref={cardRef}
			role="dialog"
			aria-modal={step.kind !== "deeplink"}
			aria-labelledby="product-tour-title"
			initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
			transition={{ type: "spring", stiffness: 300, damping: 28 }}
			style={{ width: TOOLTIP_WIDTH, maxWidth: "calc(100vw - 24px)", ...style }}
			className={cn(
				"pointer-events-auto overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl",
				className,
			)}
		>
			<div className="relative px-5 pt-5">
				<button
					type="button"
					onClick={onSkip}
					aria-label="Skip tour"
					className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					<X className="size-4" />
				</button>
				<m.div
					key={step.id}
					initial={reduceMotion ? false : { opacity: 0, x: 14 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ duration: 0.18 }}
				>
					<div className="flex items-center gap-2 pr-8">
						<h2
							id="product-tour-title"
							className="text-base font-semibold tracking-tight"
						>
							{step.title}
						</h2>
						{step.shortcutId && <ShortcutChip id={step.shortcutId} />}
					</div>
					<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
						{step.body}
					</p>
					{Demo && (
						<div className="mt-4">
							<Demo />
						</div>
					)}
				</m.div>
			</div>

			<div className="mt-5 flex items-center justify-between gap-3 border-t border-border px-5 py-3">
				<div className="flex items-center gap-1.5" aria-hidden>
					{Array.from({ length: total }, (_, i) => (
						<span
							key={i}
							className={cn(
								"h-1.5 rounded-full transition-all",
								i === index ? "w-5 bg-primary" : "w-1.5 bg-border",
							)}
						/>
					))}
				</div>

				<div className="flex items-center gap-2">
					{index > 0 && (
						<button
							type="button"
							onClick={onBack}
							className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						>
							<ArrowLeft className="size-3.5" />
							Back
						</button>
					)}
					{step.cta && (
						<button
							type="button"
							onClick={() => step.cta?.run(fx)}
							className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						>
							{step.cta.label}
						</button>
					)}
					<button
						type="button"
						onClick={onNext}
						className={cn(
							"rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							step.cta
								? "text-muted-foreground hover:bg-accent hover:text-foreground"
								: "bg-primary text-primary-foreground hover:bg-primary/90",
						)}
					>
						{isLast ? "Start writing" : "Next"}
					</button>
				</div>
			</div>
		</m.div>
	);
}

type Props = {
	onToggleShortcutHelp: (open: boolean) => void;
};

export function ProductTour({ onToggleShortcutHelp }: Props) {
	const hydrated = useTourStore((s) => s.hydrated);
	const hasSeenTour = useTourStore((s) => s.hasSeenTour);
	const activeStep = useTourStore((s) => s.activeStep);
	const startTour = useTourStore((s) => s.startTour);
	const advance = useTourStore((s) => s.advance);
	const back = useTourStore((s) => s.back);
	const dismissTour = useTourStore((s) => s.dismissTour);

	const { setIsOpen } = useCommandRegistry();
	const capabilities = useWorkspaceCapabilities();
	const isGuest = useIsGuestWorkspace();
	const reduceMotion = useReducedMotion();
	const cardRef = useRef<HTMLDivElement>(null);

	const ctx = useMemo<TourStepContext>(
		() => ({ isDesktop: isTauriRuntime(), isGuest, capabilities }),
		[isGuest, capabilities],
	);
	const steps = useMemo(() => TOUR_STEPS.filter((s) => !s.predicate || s.predicate(ctx)), [ctx]);

	useEffect(() => {
		if (hydrated && !hasSeenTour && activeStep === null) startTour();
	}, [hydrated, hasSeenTour, activeStep, startTour]);

	useEffect(() => {
		if (activeStep !== null && activeStep >= steps.length) dismissTour();
	}, [activeStep, steps.length, dismissTour]);

	const step = activeStep === null ? undefined : steps[activeStep];
	const isLast = activeStep !== null && activeStep === steps.length - 1;
	const open = Boolean(step);

	const fx = useMemo<TourEffects>(
		() => ({
			openPalette: () => setIsOpen(true),
			closePalette: () => setIsOpen(false),
			openShortcutHelp: () => onToggleShortcutHelp(true),
			closeShortcutHelp: () => onToggleShortcutHelp(false),
			openAiSettings: () => openSettings("ai"),
			openGeneralSettings: () => openSettings(),
			closeSettings: () => useSettingsModal.getState().close(),
			signIn: () => openAuthDrawer("login", "/app"),
		}),
		[setIsOpen, onToggleShortcutHelp],
	);

	useEffect(() => {
		if (!step) return;
		step.onEnter?.(fx);
		return () => step.onExit?.(fx);
	}, [step, fx]);

	const anchorRect = useAnchorRect(
		step?.kind === "spotlight" ? step.anchor : undefined,
		step?.id ?? "",
	);
	const kind = step?.kind === "spotlight" && !anchorRect ? "card" : (step?.kind ?? "card");

	useFocusTrap(open && kind !== "deeplink", cardRef);

	useEffect(() => {
		if (!open) return;
		const handler = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				dismissTour();
				return;
			}
			if (kind === "deeplink" || isEditableTarget(event.target)) return;
			if (event.key === "ArrowRight" || event.key === "Enter") {
				event.preventDefault();
				if (isLast) dismissTour();
				else advance();
			} else if (event.key === "ArrowLeft") {
				event.preventDefault();
				back();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, kind, isLast, advance, back, dismissTour]);

	if (!step || activeStep === null) return null;

	const card = (
		<TourCard
			step={step}
			index={activeStep}
			total={steps.length}
			isLast={isLast}
			fx={fx}
			onNext={isLast ? dismissTour : advance}
			onBack={back}
			onSkip={dismissTour}
			cardRef={cardRef}
			style={kind === "spotlight" && anchorRect ? tooltipStyleFor(anchorRect) : undefined}
		/>
	);

	return (
		<LazyMotion features={domAnimation} strict>
			<div className="fixed inset-0 z-[200]" style={{ pointerEvents: "none" }}>
				{kind !== "deeplink" && (
					<m.div
						key="tour-backdrop"
						initial={reduceMotion ? false : { opacity: 0 }}
						animate={{ opacity: 1 }}
						className="absolute inset-0"
						style={{ pointerEvents: "auto" }}
					>
						{kind === "spotlight" && anchorRect ? (
							<svg className="h-full w-full" aria-hidden>
								<defs>
									<mask id="product-tour-mask">
										<rect width="100%" height="100%" fill="white" />
										<rect
											x={anchorRect.left - RING_PAD}
											y={anchorRect.top - RING_PAD}
											width={anchorRect.width + RING_PAD * 2}
											height={anchorRect.height + RING_PAD * 2}
											rx={10}
											fill="black"
										/>
									</mask>
								</defs>
								<rect
									width="100%"
									height="100%"
									mask="url(#product-tour-mask)"
									className="fill-background/72"
								/>
							</svg>
						) : (
							<div className="h-full w-full bg-background/72 backdrop-blur-sm" />
						)}
					</m.div>
				)}

				{kind === "spotlight" && anchorRect && (
					<div
						aria-hidden
						className="absolute rounded-[10px] border-2 border-primary/80 shadow-[0_0_0_4px] shadow-primary/15"
						style={{
							top: anchorRect.top - RING_PAD,
							left: anchorRect.left - RING_PAD,
							width: anchorRect.width + RING_PAD * 2,
							height: anchorRect.height + RING_PAD * 2,
						}}
					/>
				)}

				{kind === "spotlight" && anchorRect ? (
					card
				) : kind === "deeplink" ? (
					<div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
						{card}
					</div>
				) : (
					<div className="absolute inset-0 flex items-center justify-center p-4">
						{card}
					</div>
				)}
			</div>
		</LazyMotion>
	);
}
