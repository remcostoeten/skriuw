"use client";

import { useEffect, useRef, useState } from "react";

export type MarkKind = "date" | "amount" | "person" | "tag" | "link" | "count";

type Segment = {
	text: string;
	kind?: MarkKind;
};

type Phase = "idle" | "typing" | "saving" | "saved";

type DemoState = {
	entryIndex: number;
	segIndex: number;
	charIndex: number;
	phase: Phase;
};

export const MARK_VARS: Record<MarkKind, string> = {
	date: "--project-blue",
	amount: "--project-green",
	person: "--project-purple",
	tag: "--project-amber",
	link: "--project-teal",
	count: "--project-orange",
};

const ENTRIES: { title: string; segments: Segment[] }[] = [
	{
		title: "journal / today",
		segments: [
			{ text: "Coffee with " },
			{ text: "$linde", kind: "person" },
			{ text: " " },
			{ text: "tomorrow 09:30", kind: "date" },
			{ text: " — pitch the " },
			{ text: "[[side-project]]", kind: "link" },
			{ text: " idea. Keep it under " },
			{ text: "€40", kind: "amount" },
			{ text: ". " },
			{ text: "#planning", kind: "tag" },
		],
	},
	{
		title: "notes / release",
		segments: [
			{ text: "Shipped the editor rewrite. " },
			{ text: "3 bugs", kind: "count" },
			{ text: " left before " },
			{ text: "friday", kind: "date" },
			{ text: ", " },
			{ text: "$mara", kind: "person" },
			{ text: " reviews the " },
			{ text: "[[release-notes]]", kind: "link" },
			{ text: ". " },
			{ text: "#dev", kind: "tag" },
		],
	},
	{
		title: "journal / groceries",
		segments: [
			{ text: "Market run " },
			{ text: "saturday", kind: "date" },
			{ text: ": " },
			{ text: "12 items", kind: "count" },
			{ text: ", roughly " },
			{ text: "€63,20", kind: "amount" },
			{ text: ". Split with " },
			{ text: "$roan", kind: "person" },
			{ text: ". " },
			{ text: "#household", kind: "tag" },
		],
	},
];

const PAUSE_AFTER = new Set([".", ",", ":", "—", ";"]);

function typedText(entryIndex: number, segIndex: number, charIndex: number) {
	const segments = ENTRIES[entryIndex].segments;
	let out = "";
	for (let i = 0; i < segIndex; i++) out += segments[i].text;
	out += segments[segIndex]?.text.slice(0, charIndex) ?? "";
	return out;
}

function countWords(text: string) {
	return text.split(/\s+/).filter(Boolean).length;
}

export function Mark({ kind, children }: { kind: MarkKind; children: string }) {
	return (
		<span
			className="px-[3px] py-[1px] transition-colors duration-300"
			style={{
				backgroundColor: `hsl(var(${MARK_VARS[kind]}) / 0.16)`,
				color: `hsl(var(${MARK_VARS[kind]}))`,
			}}
		>
			{children}
		</span>
	);
}

export function LiveNoteDemo() {
	const [state, setState] = useState<DemoState>({
		entryIndex: 0,
		segIndex: 0,
		charIndex: 0,
		phase: "idle",
	});
	const [reducedMotion, setReducedMotion] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReducedMotion(query.matches);
		const onChange = () => setReducedMotion(query.matches);
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		if (reducedMotion) return;
		const { entryIndex, segIndex, charIndex, phase } = state;
		const segments = ENTRIES[entryIndex].segments;

		function schedule(delay: number, next: DemoState) {
			timerRef.current = setTimeout(() => setState(next), delay);
		}

		if (phase === "idle") {
			schedule(700, { ...state, phase: "typing" });
		} else if (phase === "typing") {
			const segment = segments[segIndex];
			if (!segment) {
				schedule(500, { ...state, phase: "saving" });
			} else if (charIndex < segment.text.length) {
				const char = segment.text[charIndex];
				const delay = (PAUSE_AFTER.has(char) ? 170 : 32) + Math.random() * 40;
				schedule(delay, { ...state, charIndex: charIndex + 1 });
			} else {
				const delay = segment.kind ? 140 : 0;
				schedule(delay, { ...state, segIndex: segIndex + 1, charIndex: 0 });
			}
		} else if (phase === "saving") {
			schedule(650, { ...state, phase: "saved" });
		} else if (phase === "saved") {
			schedule(3400, {
				entryIndex: (entryIndex + 1) % ENTRIES.length,
				segIndex: 0,
				charIndex: 0,
				phase: "typing",
			});
		}

		return () => clearTimeout(timerRef.current);
	}, [state, reducedMotion]);

	const { entryIndex, segIndex, charIndex, phase } = state;
	const entry = ENTRIES[entryIndex];
	const showAll = reducedMotion;
	const visibleSegs = showAll ? entry.segments.length : segIndex;
	const words = countWords(
		showAll
			? entry.segments.map((s) => s.text).join("")
			: typedText(entryIndex, segIndex, charIndex),
	);
	const status = showAll
		? "saved locally"
		: phase === "saving"
			? "saving…"
			: phase === "saved"
				? "saved locally"
				: "editing";

	return (
		<div className="w-full border border-border bg-card" aria-hidden="true">
			<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
				<span className="font-mono text-xs text-muted-foreground">{entry.title}</span>
				<span className="font-mono text-xs text-muted-foreground">skriuw</span>
			</div>

			<p className="ruled-lines min-h-[10rem] px-4 pb-3 pt-5 text-base leading-8 text-foreground md:text-lg">
				{entry.segments.slice(0, visibleSegs).map((segment, i) =>
					segment.kind ? (
						<Mark key={i} kind={segment.kind}>
							{segment.text}
						</Mark>
					) : (
						<span key={i}>{segment.text}</span>
					),
				)}
				{!showAll && entry.segments[segIndex] && (
					<span>{entry.segments[segIndex].text.slice(0, charIndex)}</span>
				)}
				{!showAll && (
					<span className="ml-[1px] inline-block h-[1.15em] w-[2px] translate-y-[0.2em] animate-[caret-blink_1.1s_steps(2)_infinite] bg-foreground" />
				)}
			</p>

			<div className="flex items-center justify-between border-t border-border px-4 py-2">
				<span className="font-mono text-xs text-muted-foreground">
					{words} {words === 1 ? "word" : "words"}
				</span>
				<span
					className="font-mono text-xs"
					style={{
						color:
							status === "saved locally"
								? "hsl(var(--project-green))"
								: "hsl(var(--muted-foreground))",
					}}
				>
					{status}
				</span>
			</div>

			<style>{`
				@keyframes caret-blink {
					0%, 49% { opacity: 1; }
					50%, 100% { opacity: 0; }
				}
				.ruled-lines {
					line-height: 2rem;
					background-image: linear-gradient(hsl(var(--border) / 0.55) 1px, transparent 1px);
					background-size: 100% 2rem;
					background-position: 0 calc(1.25rem - 1px);
				}
			`}</style>
		</div>
	);
}
