"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { noop } from "@/shared/lib/noop";

const PERFORMED_WORK = 0b1;

type Fiber = {
	tag: number;
	type: unknown;
	flags: number;
	stateNode: unknown;
	actualDuration?: number;
	child: Fiber | null;
	sibling: Fiber | null;
	return: Fiber | null;
	alternate: Fiber | null;
	memoizedProps: Record<string, unknown> | null;
};

function domFiber(el: Element): Fiber | null {
	let node: Element | null = el;
	while (node) {
		if (key) return (node as unknown as Record<string, Fiber>)[key];
		node = node.parentElement;
	}
	return null;
}

function ownerComponent(fiber: Fiber): { fiber: Fiber; name: string } | null {
	let node: Fiber | null = fiber;
	let depth = 0;
	while (node && depth < 60) {
		if (COMPONENT_TAGS.has(node.tag)) {
			if (name) return { fiber: node, name };
		}
		node = node.return;
		depth += 1;
	}
	return null;
}

async function sendPulseReport(_view: {
	components: unknown[];
	commits: unknown[];
	logs: unknown[];
}) {
	try {
		a.href = url;
		a.download = "pulse-report.md";
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	} catch {
		// download unavailable in this webview — clipboard fallback below still runs
		noop();
	}

	try {
		await navigator.clipboard?.writeText(markdown);
		store.log("pulse", "report copied to clipboard + downloaded as pulse-report.md");
	} catch {
		store.log("pulse", "report downloaded as pulse-report.md (clipboard blocked)");
	}
}

let active = false;

function setPulseActive(value: boolean) {
	active = value;
	if (!active) overlay.setEnabled(false);
}

type TreeNode = { name: string; fiber: Fiber; children: TreeNode[] };
type AggNode = {
	name: string;
	count: number;
	reason: string;
	selfTime: number | undefined;
	children: AggNode[];
};

const MAX_NODES_PER_COMMIT = 4000;
const COMMIT_THROTTLE_MS = 200;

function collectTree(
	fiber: Fiber | null,
	out: TreeNode[],
	depth: number,
	budget: { left: number },
) {
	if (!fiber || depth > 500 || budget.left <= 0) return;
	if (COMPONENT_TAGS.has(fiber.tag) && fiber.flags & PERFORMED_WORK) {
		if (name) {
			if (DEVTOOL_NAMES.has(name)) {
				collectTree(fiber.sibling, out, depth, budget);
				return;
			}
			budget.left -= 1;
			const node: TreeNode = { name, fiber, children: [] };
			out.push(node);
			collectTree(fiber.child, node.children, depth + 1, budget);
			collectTree(fiber.sibling, out, depth + 1, budget);
			return;
		}
	}
	collectTree(fiber.child, out, depth + 1, budget);
	collectTree(fiber.sibling, out, depth + 1, budget);
}

function aggregate(nodes: AggNode[]): AggNode[] {
	const merged: AggNode[] = [];
	nodes.forEach((node) => {
		if (prev) {
			prev.count += 1;
			prev.children.push(...node.children);
			if (typeof node.selfTime === "number")
				prev.selfTime = (prev.selfTime ?? 0) + node.selfTime;
		} else {
			merged.push({
				name: node.name,
				count: 1,
				reason: node.reason ?? "",
				selfTime: node.selfTime,
				children: [...node.children],
			});
		}
	});
	merged.forEach((m) => {
		m.children = aggregate(m.children);
	});
	return merged;
}

function installFiberAgent() {
	if (typeof window === "undefined") return;
	const hook = (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ as
		| { onCommitFiberRoot: (id: number, root: { current: Fiber }, ...rest: unknown[]) => void }
		| undefined;

	let lastCommitAt = 0;

	function handleCommit(root: { current: Fiber }) {
		if (!active) return;
		const now = performance.now();
		if (now - lastCommitAt < COMMIT_THROTTLE_MS) return;
		lastCommitAt = now;

		store.setMode("fiber");
		const roots: TreeNode[] = [];
		collectTree(root.current, roots, 0, { left: MAX_NODES_PER_COMMIT });
		let total = 0;

		if (total) store.commit(aggregate(kept as unknown as AggNode[]), total);
	}

	if (hook) {
		const original = hook.onCommitFiberRoot;
		hook.onCommitFiberRoot = (id, root, ...rest) => {
			try {
				handleCommit(root);
			} catch {
				// pulse must never break React's commit phase
			}
			return original?.call(hook, id, root, ...rest);
		};
		return;
	}

	let rendererId = 0;
	(window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
		renderers,
		supportsFiber: true,
		inject(_renderer: unknown) {
			rendererId += 1;
			renderers.set(rendererId, _renderer);
			return rendererId;
		},
		onCommitFiberRoot(_: number, root: { current: Fiber }) {
			try {
				handleCommit(root);
			} catch {
				// pulse must never break React's commit phase
			}
		},
		onCommitFiberUnmount() {},
		onPostCommitFiberRoot() {},
		checkDCE() {},
	};
}

installFiberAgent();

function useFps(onDrop: (fps: number) => void) {
	const [fps, setFps] = useState(60);
	const [, force] = useState(0);

	useEffect(() => {
		let frames = 0;
		let last = performance.now();
		let raf: number;
		let dropping = false;

		function loop(now: number) {
			frames += 1;
			if (now - last >= 250) {
				const current = Math.min(144, Math.round((frames * 1000) / (now - last)));
				historyRef.current.push(current);
				historyRef.current.shift();
				setFps(current);
				force((n) => n + 1);
				if (current < 50 && !dropping) {
					dropping = true;
					onDrop(current);
				}
				if (current >= 55) dropping = false;
				frames = 0;
				last = now;
			}
			raf = requestAnimationFrame(loop);
		}
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [onDrop]);

	return { fps, history: historyRef.current };
}

function useLongTasks() {
	useEffect(() => {
		if (typeof PerformanceObserver === "undefined") return;
		try {
			const observer = new PerformanceObserver((list) => {
				list.getEntries().forEach((entry) => {
					store.log(
						"main thread",
						`long task blocked for ${Math.round(entry.duration)}ms`,
					);
				});
			});
			observer.observe({ entryTypes: ["longtask"] });
			return () => observer.disconnect();
		} catch {
			return undefined;
		}
	}, []);
}

function useFontAudit() {
	const [fonts, setFonts] = useState<
		{ family: string; size: string; weight: string; count: number }[]
	>([]);

	const scan = useCallback(() => {
		const seen = new Map<
			string,
			{ family: string; size: string; weight: string; count: number }
		>();
		document.querySelectorAll("body *").forEach((el) => {
			if (
				!(el as HTMLElement).textContent?.trim() ||
				(el as HTMLElement).closest("[data-devtool]")
			)
				return;
			const cs = getComputedStyle(el);
			const family = cs.fontFamily;
			const key = `${family} · ${cs.fontSize} · ${cs.fontWeight}`;
			if (!seen.has(key)) {
				seen.set(key, {
					family,
					size: cs.fontSize,
					weight: cs.fontWeight,
					count: 0,
				});
			}
			const entry = seen.get(key)!;
			entry.count += 1;
		});
		setFonts(Array.from(seen.values()).sort((a, b) => b.count - a.count));
	}, []);

	useEffect(() => {
		scan();
	}, [scan]);

	return { fonts, scan };
}

const COLOR_PROPS: [string, string][] = [
	["color", "text"],
	["backgroundColor", "bg"],
	["borderTopColor", "border"],
];

function useColorAudit() {
	const [colors, setColors] = useState<
		{
			key: string;
			count: number;
			kinds: Set<string>;
			varName: string | null;
			elements: Element[];
		}[]
	>([]);

	const scan = useCallback(() => {
		const cssVars = collectCssVars();
		const seen = new Map<
			string,
			{
				key: string;
				count: number;
				kinds: Set<string>;
				varName: string | null;
				elements: Element[];
			}
		>();
		document.querySelectorAll("body *").forEach((el) => {
			if ((el as HTMLElement).closest("[data-devtool]")) return;
			const cs = getComputedStyle(el);
			COLOR_PROPS.forEach(([prop, kind]) => {
				if (kind === "text" && !(el as HTMLElement).textContent?.trim()) return;
				if (kind === "border" && parseFloat(cs.borderTopWidth) === 0) return;
				const raw = cs[prop as keyof CSSStyleDeclaration] as string;
				if (!raw || raw === "transparent" || raw.includes("(0, 0, 0, 0)")) return;
				const key = raw;
				if (!key) return;
				if (!seen.has(key)) {
					seen.set(key, {
						key,
						count: 0,
						kinds: new Set<string>(),
						varName: cssVars.get(key) ?? null,
						elements: [],
					});
				}
				const entry = seen.get(key)!;
				entry.count += 1;
				entry.kinds.add(kind);
				if (entry.elements.length < 400) entry.elements.push(el);
			});
		});
		setColors(Array.from(seen.values()).sort((a, b) => b.count - a.count));
	}, []);

	useEffect(() => {
		scan();
		return () => overlay.setMarks([]);
	}, [scan]);

	return { colors, scan };
}

function useMeasuredHeight() {
	const [height, setHeight] = useState(120);

	useEffect(() => {
		const el = innerRef.current;
		if (!el) return;
		observer.observe(el);
		setHeight(el.offsetHeight);
		return () => observer.disconnect();
	}, []);

	return { innerRef, height };
}

function useDraggable() {
	const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
	const dragRef = useRef<{ dx: number; dy: number; w: number; h: number; moved: boolean } | null>(
		null,
	);

	function onPointerDown(e: React.PointerEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		if (
			(e.target as HTMLElement).closest("button, input, label") &&
			!(e.currentTarget as HTMLElement).classList.contains("dt-pill")
		)
			return;
		dragRef.current = {
			dx: e.clientX - rect.x,
			dy: e.clientY - rect.y,
			w: rect.width,
			h: rect.height,
			moved: false,
		};

		function move(ev: PointerEvent) {
			const d = dragRef.current!;
			d.moved = true;
			setPos({
				x: Math.min(Math.max(8, ev.clientX - d.dx), window.innerWidth - d.w - 8),
				y: Math.min(Math.max(8, ev.clientY - d.dy), window.innerHeight - d.h - 8),
			});
		}
		function up() {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		}
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}

	const didDrag = useRef(false);

	return { pos, onPointerDown, didDrag };
}

function useInspect(active: boolean, onPick: (name: string | null) => void) {
	useEffect(() => {
		if (!active) {
			overlay.setHover(null);
			return;
		}
		function move(e: MouseEvent) {
			if ((e.target as HTMLElement).closest("[data-devtool]")) {
				overlay.setHover(null);
				return;
			}
			if (owner) {
				overlay.setHover(el, owner.name);
			} else {
				overlay.setHover(null);
			}
		}
		function click(e: MouseEvent) {
			if ((e.target as HTMLElement).closest("[data-devtool]")) return;
			e.preventDefault();
			e.stopPropagation();
			const fiber = domFiber(e.target as Element);
			const owner = fiber ? ownerComponent(fiber) : null;
			if (owner) onPick(owner.name);
		}
		function key(e: KeyboardEvent) {
			if (e.key === "Escape") onPick(null);
		}
		document.addEventListener("mousemove", move, true);
		document.addEventListener("click", click, true);
		document.addEventListener("keydown", key, true);
		return () => {
			overlay.setHover(null);
			document.removeEventListener("mousemove", move, true);
			document.removeEventListener("click", click, true);
			document.removeEventListener("keydown", key, true);
		};
	}, [active, onPick]);
}

function FpsGraph({ history, fps }: { history: number[]; fps: number }) {
	const width = 264;
	const height = 56;
	const barWidth = width / history.length;
	const color = fps >= 55 ? "#e8e8e8" : fps >= 45 ? "#d9b98c" : "#d98c8c";

	return (
		<div className="dt-card">
			<div className="dt-row dt-baseline">
				<span className="dt-fps-big" style={{ color }}>
					{fps}
				</span>
				<span className="dt-dim dt-xs">fps · last ~22s</span>
			</div>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				style={{ width: "100%", marginTop: 12, display: "block" }}
			>
				<line
					x1="0"
					y1={height - (60 / 144) * height}
					x2={width}
					y2={height - (60 / 144) * height}
					stroke="#404040"
					strokeDasharray="3 4"
					strokeWidth="1"
				/>
				{history.map((value, i) => {
					const fill = value >= 55 ? "#8c8c8c" : value >= 45 ? "#b8926a" : "#b86a6a";
					return (
						<rect
							key={i}
							x={i * barWidth}
							y={height - barHeight}
							width={Math.max(1, barWidth - 1.5)}
							height={barHeight}
							fill={fill}
							opacity={0.35 + (i / history.length) * 0.65}
						/>
					);
				})}
			</svg>
		</div>
	);
}

function ComponentRow({
	entry,
	now,
	onSelect,
}: {
	entry: {
		name: string;
		lastRender: number;
		timed: number;
		selfTotal: number;
		renders: number;
		wasted: number;
		lastReason: string;
	};
	now: number;
	onSelect: (name: string) => void;
}) {
	const idleMs = now - entry.lastRender;
	const stable = idleMs > 3000;
	const avg = entry.timed ? entry.selfTotal / entry.timed : null;
	return (
		<button className="dt-comp-row dt-press" onClick={() => onSelect(entry.name)}>
			<div className="dt-row" style={{ gap: 10, minWidth: 0 }}>
				<span className={stable ? "dt-dot" : "dt-dot dt-dot-hot"} />
				<span className="dt-comp-name">{entry.name}</span>
			</div>
			<div className="dt-row" style={{ gap: 8 }}>
				{avg !== null && <span className="dt-dim dt-xs dt-nums">{avg.toFixed(1)}ms</span>}
				{entry.wasted > 0 && (
					<span className="dt-badge dt-badge-warn dt-nums">{entry.wasted} wasted</span>
				)}
				<span className="dt-dim dt-xs dt-nums">{entry.renders}×</span>
				<span className={stable ? "dt-badge" : "dt-badge dt-badge-hot"}>
					{stable ? "stable" : `${(idleMs / 1000).toFixed(1)}s`}
				</span>
			</div>
		</button>
	);
}

function InspectCard({
	entry,
	onClear,
}: {
	entry: {
		name: string;
		renders: number;
		wasted: number;
		timed: number;
		selfTotal: number;
		lastReason: string;
	};
	onClear: () => void;
}) {
	const avg = entry.timed ? entry.selfTotal / entry.timed : null;
	return (
		<div className="dt-card" style={{ borderColor: "#454545" }}>
			<div className="dt-row dt-between">
				<span className="dt-card-title">{entry.name}</span>
				<button onClick={onClear} className="dt-btn dt-btn-sm dt-press">
					Unpin
				</button>
			</div>
			<div className="dt-inspect-grid">
				<div>
					<div className="dt-stat">{entry.renders}</div>
					<div className="dt-stat-label">renders</div>
				</div>
				<div>
					<div
						className="dt-stat"
						style={{ color: entry.wasted ? "#d9b98c" : undefined }}
					>
						{entry.wasted}
					</div>
					<div className="dt-stat-label">wasted ({wasteShare}%)</div>
				</div>
				<div>
					<div className="dt-stat">{avg !== null ? `${avg.toFixed(1)}ms` : "—"}</div>
					<div className="dt-stat-label">avg self time</div>
				</div>
			</div>
			<p className="dt-card-copy">Last reason: {entry.lastReason || "—"}</p>
		</div>
	);
}

const MAX_TREE_DEPTH = 6;

function CommitTree({
	nodes,
	depth,
}: {
	nodes: {
		name: string;
		count: number;
		reason?: string;
		selfTime?: number;
		children: unknown[];
	}[];
	depth: number;
}) {
	if (depth > MAX_TREE_DEPTH) return null;
	const hidden = nodes.length - shown.length;
	return (
		<>
			{shown.map((node, i) => (
				<div key={`${node.name}${i}`} style={{ paddingLeft: depth * 14 }}>
					<div className="dt-tree-row">
						<span className="dt-tree-guide">{depth > 0 ? "└" : ""}</span>
						<span style={{ color: "#e5e5e5" }}>
							{node.count > 1 ? `${node.count}× ` : ""}
							{node.name}
						</span>
						{typeof node.selfTime === "number" && (
							<span className="dt-dim dt-nums" style={{ fontSize: 11 }}>
								{node.selfTime.toFixed(1)}ms
							</span>
						)}
						{node.reason?.includes("memo candidate") && (
							<span className="dt-badge dt-badge-warn">wasted</span>
						)}
					</div>
					{node.reason && depth === 0 && (
						<div className="dt-tree-reason">{node.reason}</div>
					)}
					<CommitTree
						nodes={
							node.children as {
								name: string;
								count: number;
								reason?: string;
								selfTime?: number;
								children: unknown[];
							}[]
						}
						depth={depth + 1}
					/>
				</div>
			))}
			{hidden > 0 && (
				<div className="dt-tree-reason" style={{ paddingLeft: depth * 14 }}>
					+{hidden} more
				</div>
			)}
		</>
	);
}

function LogRow({ log }: { log: { time: Date; name: string; reason: string } }) {
	return (
		<div className="dt-log-row dt-log-enter">
			<span className="dt-nums" style={{ color: "#525252" }}>
				{t}
			</span>
			<span style={{ color: "#737373", margin: "0 6px" }}>·</span>
			<span style={{ color: "#e5e5e5" }}>{log.name}</span>
			<span style={{ color: "#a3a3a3" }}> · {log.reason}</span>
		</div>
	);
}

function ColorsPanel({
	colors,
	scan,
}: {
	colors: {
		key: string;
		count: number;
		kinds: Set<string>;
		varName: string | null;
		elements: Element[];
	}[];
	scan: () => void;
}) {
	const [selected, setSelected] = useState<string | null>(null);

	useEffect(() => () => overlay.setMarks([]), []);

	return (
		<div className="dt-stack">
			<div className="dt-row dt-between">
				<span className="dt-section-title">
					Colors: {colors.length}
					{offCount > 0 && (
						<span className="dt-badge dt-badge-warn" style={{ marginLeft: 8 }}>
							{offCount} without variable
						</span>
					)}
				</span>
				<button
					onClick={() => {
						setSelected(null);
						overlay.setMarks([]);
						scan();
					}}
					className="dt-btn dt-btn-sm dt-press"
				>
					Rescan
				</button>
			</div>
			<p className="dt-hint">
				Click a swatch to outline every element using that color on the page. Colors with no
				matching CSS variable and low usage are the usual off-color suspects.
			</p>
			<div className="dt-color-grid">
				{colors.map((entry) => (
					<button
						key={entry.key}
						onClick={() => pick(entry)}
						className={
							selected === entry.key
								? "dt-swatch dt-press dt-swatch-active"
								: "dt-swatch dt-press"
						}
					>
						<span className="dt-swatch-chip" style={{ background: entry.key }} />
						<span className="dt-swatch-hex dt-nums">{entry.key}</span>
						<span className="dt-swatch-var">{entry.varName ?? "no variable"}</span>
						<span className="dt-row dt-between" style={{ width: "100%" }}>
							<span className="dt-dim dt-nums" style={{ fontSize: 10 }}>
								{[...entry.kinds].join(" · ")}
							</span>
							<span
								className={
									entry.varName || entry.count > 3
										? "dt-badge dt-nums"
										: "dt-badge dt-badge-warn dt-nums"
								}
							>
								×{entry.count}
							</span>
						</span>
					</button>
				))}
			</div>
		</div>
	);
}

function FontsPanel({
	fonts,
	scan,
}: {
	fonts: { family: string; size: string; weight: string; count: number }[];
	scan: () => void;
}) {
	return (
		<div className="dt-stack">
			<div className="dt-row dt-between">
				<span className="dt-section-title">Fonts: {fonts.length}</span>
				<button onClick={scan} className="dt-btn dt-btn-sm dt-press">
					Rescan
				</button>
			</div>
			<div className="dt-font-grid">
				{fonts.map((f) => (
					<div
						key={`${f.family}${f.size}${f.weight}`}
						className="dt-card"
						style={{ padding: 12 }}
					>
						<div
							className="dt-font-sample"
							style={{ fontFamily: f.family, fontWeight: f.weight }}
						>
							Aa Bb 0123
						</div>
						<div className="dt-font-family">{f.family}</div>
						<div className="dt-dim dt-nums" style={{ fontSize: 11 }}>
							{f.size} / {f.weight} · {f.count} el
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

const TABS = [
	["fps", "Frames"],
	["renders", "Renders"],
	["log", "Log"],
	["colors", "Colors"],
	["fonts", "Fonts"],
] as const;

export function Pulse({
	highlight,
	setHighlight,
}: {
	highlight: boolean;
	setHighlight: (v: boolean) => void;
}) {
	const [tab, setTab] = useState("fps");
	const [collapsed, setCollapsed] = useState(false);
	const [inspecting, setInspecting] = useState(false);
	const [pinned, setPinned] = useState<string | null>(null);
	const [filter, setFilter] = useState("");
	const [paused, setPaused] = useState(false);
	const [logView, setLogView] = useState("commits");
	const [sortBy, setSortBy] = useState("recent");

	const [now] = useState(() => performance.now());
	const { fonts, scan } = useFontAudit();
	const { colors, scan: scanColors } = useColorAudit();
	const { pos, onPointerDown, didDrag } = useDraggable();

	useEffect(() => {
		setPulseActive(true);
		return () => setPulseActive(false);
	}, []);

	useEffect(() => {
		if (tab !== "colors") overlay.setMarks([]);
	}, [tab]);

	const onDrop = useCallback((value: number) => {
		store.log(
			"frame budget",
			`fps dropped to ${value} — check the render log around this timestamp`,
		);
	}, []);

	const { fps, history } = useFps(onDrop);
	useLongTasks();

	const onPick = useCallback((name: string | null) => {
		setInspecting(false);
		if (name) {
			setPinned(name);
			setFilter(name);
			setTab("renders");
			setCollapsed(false);
		}
	}, []);

	useInspect(inspecting, onPick);

	useEffect(() => {
		overlay.setEnabled(highlight);
	}, [highlight]);

	useEffect(() => {
		function key(e: KeyboardEvent) {
			if (e.key !== "`") return;
			const t = e.target as HTMLElement;
			if (t.closest?.("input, textarea, select") || t.isContentEditable) return;
			e.preventDefault();
			setCollapsed((v) => !v);
		}
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, []);

	useEffect(() => {
		return () => clearInterval(id);
	}, []);

	const logs = useMemo(
		() =>
			(view.logs as { id: number; time: Date; name: string; reason: string }[])
				.slice()
				.reverse()
				.filter((l) => !filter || l.name.toLowerCase().includes(filter.toLowerCase())),
		[view.logs, filter],
	);
	const pinnedEntry = pinned
		? (
				view.components as {
					name: string;
					renders: number;
					wasted: number;
					timed: number;
					selfTotal: number;
					lastReason: string;
				}[]
			).find((c) => c.name === pinned)
		: null;

	const { innerRef, height } = useMeasuredHeight();
	const capped = height > cap;

	const posStyle = pos
		? { left: pos.x, top: pos.y, right: "auto" as const, bottom: "auto" as const }
		: {};

	if (collapsed) {
		return (
			<button
				data-devtool
				className="dt-pill dt-press"
				style={posStyle}
				onPointerDown={onPointerDown}
				onClick={() => {
					if (!didDrag()) setCollapsed(false);
				}}
			>
				<span className="dt-logo" style={{ width: 10, height: 10 }} />
				<span className="dt-nums" style={{ color: fps >= 55 ? "#e5e5e5" : "#d98c8c" }}>
					{fps}
				</span>
				<span className="dt-dim" style={{ fontSize: 10 }}>
					fps
				</span>
			</button>
		);
	}

	return (
		<aside data-devtool className="dt-panel" style={posStyle}>
			<header className="dt-header" onPointerDown={onPointerDown}>
				<div className="dt-row" style={{ gap: 10 }}>
					<span className="dt-logo" />
					<span className="dt-title">Pulse</span>
					<span
						className={
							fps >= 55 ? "dt-badge dt-nums" : "dt-badge dt-badge-drop dt-nums"
						}
					>
						{fps} fps
					</span>
					<span
						className="dt-badge"
						title={
							snap.mode === "fiber"
								? "Automatic — hooked into React's commit cycle"
								: "Manual probes — fiber hook unavailable (React loaded first)"
						}
					>
						{snap.mode}
					</span>
				</div>
				<div className="dt-row" style={{ gap: 8 }}>
					<button
						className={
							inspecting
								? "dt-icon-btn dt-icon-active dt-press"
								: "dt-icon-btn dt-press"
						}
						title="Inspect a component (Esc to exit)"
						onClick={() => setInspecting((v) => !v)}
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M3 3l7 18 2.5-7.5L20 11z" />
						</svg>
					</button>
					<button
						className="dt-icon-btn dt-press"
						title="Collapse (`)"
						onClick={() => setCollapsed(true)}
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						>
							<path d="M6 9l6 6 6-6" />
						</svg>
					</button>
				</div>
			</header>

			<nav className="dt-tabs">
				{TABS.map(([id, tabLabel]) => (
					<button
						key={id}
						onClick={() => setTab(id)}
						className={tab === id ? "dt-tab dt-tab-active dt-press" : "dt-tab dt-press"}
					>
						{tabLabel}
					</button>
				))}
				<label className="dt-toggle" style={{ marginLeft: "auto" }}>
					<input
						type="checkbox"
						checked={highlight}
						onChange={(e) => setHighlight(e.target.checked)}
					/>
					paint
				</label>
			</nav>

			{(tab === "renders" || tab === "log") && (
				<div className="dt-filter-bar">
					<input
						className="dt-input"
						placeholder="Filter components…"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
					/>
					<button
						className={
							paused
								? "dt-btn dt-btn-sm dt-press dt-btn-active"
								: "dt-btn dt-btn-sm dt-press"
						}
						onClick={() => {
							if (!paused) frozenRef.current = snap;
							setPaused((v) => !v);
						}}
					>
						{paused ? "Resume" : "Pause"}
					</button>
				</div>
			)}

			<div
				className="dt-body"
				style={{ height: bodyHeight, overflowY: capped ? "auto" : "hidden" }}
			>
				<div ref={innerRef} className="dt-body-inner">
					{tab === "fps" && (
						<div className="dt-stack">
							<FpsGraph history={history} fps={fps} />
							<p className="dt-hint">
								Dashed line marks the 60fps budget. Outline colors on the page map
								render cost: gray under 2ms, amber under 8ms, red above.
							</p>
						</div>
					)}
					{tab === "renders" && (
						<div className="dt-stack" style={{ gap: 8 }}>
							{pinnedEntry && (
								<InspectCard
									entry={pinnedEntry}
									onClear={() => {
										setPinned(null);
										setFilter("");
									}}
								/>
							)}
							<div className="dt-row dt-between">
								<span className="dt-section-title">
									Components: {sorted.length}
								</span>
								<div className="dt-row" style={{ gap: 4 }}>
									{["recent", "wasted"].map((s) => (
										<button
											key={s}
											onClick={() => setSortBy(s)}
											className={
												sortBy === s
													? "dt-chip dt-chip-active dt-press"
													: "dt-chip dt-press"
											}
										>
											{s}
										</button>
									))}
								</div>
							</div>
							{sorted.map((entry) => (
								<ComponentRow
									key={entry.name}
									entry={entry}
									now={now}
									onSelect={(name) => setPinned(name)}
								/>
							))}
							{!sorted.length && (
								<p className="dt-hint">
									Nothing tracked yet — interact with the app.
								</p>
							)}
						</div>
					)}
					{tab === "log" && (
						<div className="dt-stack" style={{ gap: 8 }}>
							<div className="dt-row dt-between">
								<div className="dt-row" style={{ gap: 4 }}>
									{["commits", "raw"].map((v) => (
										<button
											key={v}
											onClick={() => setLogView(v)}
											className={
												logView === v
													? "dt-chip dt-chip-active dt-press"
													: "dt-chip dt-press"
											}
										>
											{v}
										</button>
									))}
								</div>
								<div className="dt-row" style={{ gap: 4 }}>
									<button
										className="dt-chip dt-press"
										title="Write an AI-agent-readable report to .pulse/report.md"
										onClick={() => sendPulseReport(view)}
									>
										report
									</button>
									<button
										className="dt-chip dt-press"
										title="Copy session as JSON"
										onClick={() => {
											navigator.clipboard?.writeText(
												JSON.stringify(
													{
														exportedAt: new Date().toISOString(),
														components: view.components,
														commits: view.commits,
														logs: view.logs,
													},
													null,
													2,
												),
											);
											store.log(
												"pulse",
												"session copied to clipboard as JSON",
											);
										}}
									>
										export
									</button>
								</div>
							</div>
							{logView === "commits" &&
								(
									commits as {
										id: number;
										time: Date;
										total: number;
										roots: unknown[];
									}[]
								).map((commit) => (
									<div key={commit.id} className="dt-commit dt-log-enter">
										<div
											className="dt-row dt-between"
											style={{ marginBottom: 6 }}
										>
											<span
												className="dt-nums"
												style={{ color: "#525252", fontSize: 11 }}
											>
												{commit.time.toTimeString().slice(0, 8)}
											</span>
											<span
												className="dt-dim dt-nums"
												style={{ fontSize: 11 }}
											>
												{commit.total} rendered
											</span>
										</div>
										<CommitTree
											nodes={
												commit.roots as {
													name: string;
													count: number;
													reason?: string;
													selfTime?: number;
													children: unknown[];
												}[]
											}
											depth={0}
										/>
									</div>
								))}
							{logView === "commits" && !commits.length && (
								<p className="dt-hint">
									No commits captured yet
									{snap.mode === "probe" ? " — commit trees need fiber mode" : ""}
									.
								</p>
							)}
							{logView === "raw" &&
								(
									logs as {
										id: number;
										name: string;
										time: Date;
										reason: string;
									}[]
								).map((log) => <LogRow key={log.id} log={log} />)}
							{logView === "raw" && !logs.length && (
								<p className="dt-hint">No render events yet.</p>
							)}
						</div>
					)}
					{tab === "colors" && <ColorsPanel colors={colors} scan={scanColors} />}
					{tab === "fonts" && <FontsPanel fonts={fonts} scan={scan} />}
				</div>
			</div>
		</aside>
	);
}

export function PulseMount() {
	const [highlight, setHighlight] = useState(false);

	return <Pulse highlight={highlight} setHighlight={setHighlight} />;
}

const STYLES = `
  .dt-root { --surface: #171717; --line: #2a2a2a; --ink: #e5e5e5; --muted: #8a8a8a; min-height: 100vh; background: #141416; color: var(--ink); padding: 24px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 14px; -webkit-font-smoothing: antialiased; }
  .dt-root *, .dt-root *::before, .dt-root *::after { box-sizing: border-box; }
  .dt-root button { font: inherit; color: inherit; cursor: pointer; }
  .dt-root p { margin: 0; }
  .dt-root input { font: inherit; }

  .dt-row { display: flex; align-items: center; }
  .dt-between { justify-content: space-between; }
  .dt-baseline { justify-content: space-between; align-items: baseline; }
  .dt-stack { display: flex; flex-direction: column; gap: 12px; }
  .dt-nums { font-variant-numeric: tabular-nums; }
  .dt-dim { color: #737373; }
  .dt-xs { font-size: 12px; }

  .dt-card { background: var(--surface); border: 1px solid var(--line); border-radius: 0; padding: 16px; }
  .dt-card-title { font-size: 14px; color: var(--ink); }
  .dt-card-copy { margin-top: 4px; font-size: 12px; line-height: 1.55; color: var(--muted); }

  .dt-btn { display: block; width: 100%; background: #262626; border: 1px solid #3d3d3d; border-radius: 0; padding: 7px 12px; font-size: 12px; color: #e5e5e5; }
  .dt-btn:hover { background: #2e2e2e; }
  .dt-btn-sm { width: auto; padding: 5px 10px; }
  .dt-btn-active { background: #3a2f26; border-color: #5a4a38; color: #d9b98c; }

  .dt-icon-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: transparent; border: 1px solid transparent; border-radius: 0; color: #737373; }
  .dt-icon-btn:hover { color: #d4d4d4; background: #262626; }
  .dt-icon-active { color: #f5f5f5; background: #2e2e2e; border-color: #454545; }

  .dt-chip { background: transparent; border: none; border-radius: 0; padding: 3px 8px; font-size: 11px; color: #737373; }
  .dt-chip:hover { color: #d4d4d4; }
  .dt-chip-active { background: #2e2e2e; color: #f5f5f5; }

  .dt-panel { position: fixed; bottom: 16px; right: 16px; width: 340px; display: flex; flex-direction: column; overflow: hidden; background: #1e1e20; border: 1px solid #2e2e2e; border-radius: 0; box-shadow: 0 24px 60px rgba(0,0,0,0.55); font-family: Inter, ui-sans-serif, system-ui, sans-serif; z-index: 2147483647; }
  .dt-pill { position: fixed; bottom: 16px; right: 16px; display: flex; align-items: center; gap: 6px; padding: 7px 12px; background: #1e1e20; border: 1px solid #2e2e2e; border-radius: 0; box-shadow: 0 12px 30px rgba(0,0,0,0.5); font-size: 12px; z-index: 2147483647; cursor: pointer; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .dt-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #2a2a2a; user-select: none; cursor: grab; }
  .dt-header:active { cursor: grabbing; }
  .dt-logo { display: block; width: 16px; height: 16px; border-radius: 50%; background: conic-gradient(#8c8c8c, #e8e8e8, #404040, #8c8c8c); }
  .dt-title { font-size: 14px; font-weight: 500; color: #f5f5f5; }
  .dt-toggle { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #737373; cursor: pointer; }
  .dt-toggle input { accent-color: #a3a3a3; }

  .dt-tabs { display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-bottom: 1px solid #2a2a2a; }
  .dt-tab { background: transparent; border: none; border-radius: 0; padding: 5px 10px; font-size: 12px; color: #737373; transition: color 150ms ease, background-color 150ms ease; }
  .dt-tab:hover { color: #d4d4d4; }
  .dt-tab-active { background: #2e2e2e; color: #f5f5f5; }

  .dt-filter-bar { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #2a2a2a; }
  .dt-input { flex: 1; min-width: 0; background: #171717; border: 1px solid #2e2e2e; border-radius: 0; padding: 5px 10px; font-size: 12px; color: #e5e5e5; outline: none; }
  .dt-input::placeholder { color: #5a5a5a; }
  .dt-input:focus { border-color: #454545; }

  .dt-body { transition: height 350ms cubic-bezier(0.23, 1, 0.32, 1); }
  .dt-body-inner { padding: 12px; }
  .dt-section-title { font-size: 13px; color: #d4d4d4; padding: 0 4px; }
  .dt-hint { padding: 0 4px; font-size: 11px; line-height: 1.6; color: #737373; }
  .dt-fps-big { font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }

  .dt-comp-row { display: flex; align-items: center; justify-content: space-between; width: 100%; text-align: left; background: #1c1c1c; border: 1px solid #2a2a2a; border-radius: 0; padding: 8px 12px; }
  .dt-comp-row:hover { border-color: #3d3d3d; }
  .dt-comp-name { font-size: 13px; color: #e5e5e5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dt-dot { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: #525252; transition: background-color 500ms ease, box-shadow 500ms ease; }
  .dt-dot-hot { background: #e8e8e8; box-shadow: 0 0 8px rgba(232,232,232,0.5); }

  .dt-badge { border-radius: 0; padding: 2px 6px; font-size: 11px; background: #262626; color: #8a8a8a; white-space: nowrap; }
  .dt-badge-hot { background: rgba(232,232,232,0.1); color: #d4d4d4; }
  .dt-badge-drop { background: #3a2626; color: #d98c8c; }
  .dt-badge-warn { background: #34291c; color: #d9b98c; }

  .dt-inspect-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 12px 0 8px; }
  .dt-stat { font-size: 18px; font-weight: 600; color: #f5f5f5; font-variant-numeric: tabular-nums; }
  .dt-stat-label { font-size: 10px; color: #737373; margin-top: 2px; }

  .dt-commit { background: #1c1c1c; border: 1px solid #2a2a2a; border-radius: 0; padding: 10px 12px; }
  .dt-tree-row { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.7; }
  .dt-tree-guide { color: #454545; font-size: 10px; }
  .dt-tree-reason { font-size: 11px; color: #8a8a8a; padding-left: 14px; margin-bottom: 2px; }

  .dt-log-row { padding: 8px 4px; font-size: 12px; line-height: 1.6; border-bottom: 1px solid rgba(42,42,42,0.6); }
  .dt-log-row:last-child { border-bottom: none; }

  .dt-font-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  .dt-color-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .dt-swatch { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; background: #171717; border: 1px solid #2a2a2a; border-radius: 0; padding: 10px; text-align: left; }
  .dt-swatch:hover { border-color: #3d3d3d; }
  .dt-swatch-active { border-color: #6a6a6a; background: #1c1c1c; }
  .dt-swatch-chip { display: block; width: 100%; height: 28px; border: 1px solid #2e2e2e; }
  .dt-swatch-hex { font-size: 11px; color: #d4d4d4; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .dt-swatch-var { font-size: 10px; color: #737373; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .dt-font-sample { font-size: 18px; color: #f5f5f5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dt-font-family { margin-top: 6px; font-size: 11px; color: #a3a3a3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .dt-log-enter { animation: dtLog 300ms cubic-bezier(0.23, 1, 0.32, 1); }
  @keyframes dtLog {
    from { opacity: 0; transform: translateY(-3px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .dt-press { transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1), background-color 150ms ease, color 150ms ease, border-color 150ms ease; }
  .dt-press:active { transform: scale(0.97); }

  @media (prefers-reduced-motion: reduce) {
    .dt-log-enter { animation: none; }
    .dt-body { transition: none; }
  }
`;

export function PulseRoot() {
	return (
		<>
			<style>{STYLES}</style>
			<PulseMount />
		</>
	);
}
