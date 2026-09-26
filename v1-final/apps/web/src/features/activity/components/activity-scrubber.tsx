"use client";

import {
	type PointerEvent as ReactPointerEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { format } from "date-fns";

type Props = {
	scrollRef: RefObject<HTMLDivElement | null>;
	scrollRegionId: string;
	revision: number;
};

type Metrics = {
	max: number;
	entries: Array<{ top: number; iso: string }>;
	buckets: Array<{ id: string; fraction: number }>;
};

const EMPTY_METRICS: Metrics = { max: 0, entries: [], buckets: [] };
const MIN_SCROLLABLE_PX = 8;

function clamp01(value: number): number {
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

function labelForScrollTop(metrics: Metrics, scrollTop: number): string {
	if (metrics.entries.length === 0) return "";
	let match = metrics.entries[0];
	for (const entry of metrics.entries) {
		if (entry.top > scrollTop + 12) break;
		match = entry;
	}
	const date = new Date(match.iso);
	return Number.isNaN(date.getTime()) ? "" : format(date, "MMM d, yyyy");
}

export function ActivityScrubber({ scrollRef, scrollRegionId, revision }: Props) {
	const trackRef = useRef<HTMLDivElement>(null);
	const metricsRef = useRef<Metrics>(EMPTY_METRICS);
	const draggingRef = useRef(false);
	const [progress, setProgress] = useState(0);
	const [layout, setLayout] = useState<{
		viewFraction: number;
		maxScroll: number;
		buckets: Metrics["buckets"];
	}>({ viewFraction: 1, maxScroll: 0, buckets: [] });
	const [readout, setReadout] = useState<{ y: number; label: string } | null>(null);

	const measure = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const scrollHeight = el.scrollHeight;
		const clientHeight = el.clientHeight;
		const max = scrollHeight - clientHeight;

		const entries: Metrics["entries"] = [];
		el.querySelectorAll<HTMLElement>("[data-activity-ts]").forEach((node) => {
			entries.push({ top: node.offsetTop, iso: node.dataset.activityTs ?? "" });
		});

		const nextBuckets: Metrics["buckets"] = [];
		el.querySelectorAll<HTMLElement>("[data-bucket-id]").forEach((node) => {
			nextBuckets.push({
				id: node.dataset.bucketId ?? "",
				fraction: scrollHeight > 0 ? clamp01(node.offsetTop / scrollHeight) : 0,
			});
		});

		metricsRef.current = { max, entries, buckets: nextBuckets };
		setLayout({
			buckets: nextBuckets,
			maxScroll: max,
			viewFraction: scrollHeight > 0 ? clamp01(clientHeight / scrollHeight) : 1,
		});
	}, [scrollRef]);

	const syncProgress = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const max = el.scrollHeight - el.clientHeight;
		setProgress(max > 0 ? clamp01(el.scrollTop / max) : 0);
	}, [scrollRef]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		measure();
		syncProgress();
		const onScroll = () => syncProgress();
		el.addEventListener("scroll", onScroll, { passive: true });
		const observer = new ResizeObserver(() => {
			measure();
			syncProgress();
		});
		observer.observe(el);
		if (el.firstElementChild) observer.observe(el.firstElementChild);
		return () => {
			el.removeEventListener("scroll", onScroll);
			observer.disconnect();
		};
	}, [scrollRef, measure, syncProgress, revision]);

	const scrubToClientY = useCallback(
		(clientY: number, applyScroll: boolean) => {
			const track = trackRef.current;
			const el = scrollRef.current;
			if (!track || !el) return;
			const rect = track.getBoundingClientRect();
			const fraction = clamp01((clientY - rect.top) / rect.height);
			const target = fraction * metricsRef.current.max;
			if (applyScroll) el.scrollTop = target;
			setReadout({
				y: fraction * rect.height,
				label: labelForScrollTop(metricsRef.current, target),
			});
		},
		[scrollRef],
	);

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		draggingRef.current = true;
		event.currentTarget.setPointerCapture(event.pointerId);
		scrubToClientY(event.clientY, true);
	};

	const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		scrubToClientY(event.clientY, draggingRef.current);
	};

	const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		draggingRef.current = false;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const handlePointerLeave = () => {
		if (!draggingRef.current) setReadout(null);
	};

	const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const el = scrollRef.current;
		if (!el) return;
		const max = metricsRef.current.max;
		if (max <= MIN_SCROLLABLE_PX) return;

		const current = clamp01(el.scrollTop / max);
		const pageStep = Math.max(layout.viewFraction * 0.9, 0.1);
		const fineStep = 0.05;
		let next = current;

		switch (event.key) {
			case "ArrowUp":
			case "ArrowLeft":
				next = current - fineStep;
				break;
			case "ArrowDown":
			case "ArrowRight":
				next = current + fineStep;
				break;
			case "PageUp":
				next = current - pageStep;
				break;
			case "PageDown":
				next = current + pageStep;
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = 1;
				break;
			default:
				return;
		}

		event.preventDefault();
		const clamped = clamp01(next);
		el.scrollTop = clamped * max;
		setProgress(clamped);
		setReadout({
			y: clamped * (trackRef.current?.clientHeight ?? 0),
			label: labelForScrollTop(metricsRef.current, clamped * max),
		});
	};

	if (layout.maxScroll <= MIN_SCROLLABLE_PX) return null;

	const thumbHeight = Math.max(layout.viewFraction, 0.06);
	const thumbTop = progress * (1 - thumbHeight);

	return (
		<div
			className="group absolute inset-y-3 right-1 z-20 flex w-6 cursor-pointer touch-none justify-end focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			role="scrollbar"
			tabIndex={0}
			aria-label="Activity scrubber"
			aria-controls={scrollRegionId}
			aria-orientation="vertical"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(progress * 100)}
			aria-valuetext={readout?.label ?? "Activity timeline"}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerLeave={handlePointerLeave}
			onKeyDown={handleKeyDown}
		>
			<div
				ref={trackRef}
				className="relative h-full w-1 rounded-full bg-border/70 transition-colors group-hover:bg-border"
			>
				{layout.buckets.map((bucket) => (
					<span
						key={bucket.id}
						className="absolute -left-0.5 h-px w-2 -translate-y-1/2 rounded-full bg-muted-foreground/40"
						style={{ top: `${bucket.fraction * 100}%` }}
					/>
				))}

				<span
					className="absolute inset-x-0 rounded-full bg-muted-foreground/50 transition-colors group-hover:bg-foreground/80"
					style={{ top: `${thumbTop * 100}%`, height: `${thumbHeight * 100}%` }}
				/>

				{readout && readout.label ? (
					<span
						className="pointer-events-none absolute right-4 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium tabular-nums text-popover-foreground shadow-md"
						style={{ top: readout.y }}
					>
						{readout.label}
					</span>
				) : null}
			</div>
		</div>
	);
}
