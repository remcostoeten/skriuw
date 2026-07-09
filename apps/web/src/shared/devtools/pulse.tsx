// @ts-nocheck
// Deliberately untyped devtools probe (excluded from tsconfig's normal type-check
// scope); Next's build-time check doesn't honor that exclude, so opt out explicitly.
import {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

const PERFORMED_WORK = 0b1;
const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]);
const HOST_TAG = 5;
const PROVIDER_TAG = 10;
const MAX_LOGS = 400;
const MAX_COMMITS = 30;
const MAX_COMPONENTS = 400;
const MAX_NODES_PER_COMMIT = 300;
const MAX_OVERLAY_ENTRIES = 60;
const MAX_CAUSES = 6;

function createStore() {
	const components = new Map();
	const logs = [];
	const commits = [];
	const listeners = new Set();
	let snapshot = { components: [], logs: [], commits: [], mode: "probe" };
	let scheduled = false;
	let logId = 0;
	let commitId = 0;

	function emit() {
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(() => {
			scheduled = false;
			snapshot = {
				components: [...components.values()],
				logs: logs.slice(-120),
				commits: [...commits],
				mode: snapshot.mode,
			};
			listeners.forEach((l) => l());
		});
	}

	function evict() {
		if (components.size <= MAX_COMPONENTS) return;
		let oldest = null;
		components.forEach((entry, key) => {
			if (!oldest || entry.lastRender < components.get(oldest).lastRender) oldest = key;
		});
		if (oldest) components.delete(oldest);
	}

	return {
		report(name, reason, selfTime, cause) {
			const entry = components.get(name) ?? {
				name,
				renders: 0,
				wasted: 0,
				lastRender: 0,
				selfTotal: 0,
				timed: 0,
				lastReason: "",
				causes: {},
			};
			entry.renders += 1;
			entry.lastRender = performance.now();
			entry.lastReason = reason;
			if (reason.includes("memo candidate")) entry.wasted += 1;
			if (typeof selfTime === "number") {
				entry.selfTotal += selfTime;
				entry.timed += 1;
			}
			if (
				cause &&
				(entry.causes[cause] !== undefined || Object.keys(entry.causes).length < MAX_CAUSES)
			) {
				entry.causes[cause] = (entry.causes[cause] ?? 0) + 1;
			}
			components.set(name, entry);
			evict();
			logId += 1;
			logs.push({ id: logId, time: new Date(), name, reason });
			if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
			emit();
		},
		commit(roots, total, truncated) {
			commitId += 1;
			commits.push({ id: commitId, time: new Date(), roots, total, truncated });
			if (commits.length > MAX_COMMITS) commits.splice(0, commits.length - MAX_COMMITS);
			emit();
		},
		log(name, reason) {
			logId += 1;
			logs.push({ id: logId, time: new Date(), name, reason });
			if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
			emit();
		},
		setMode(mode) {
			if (snapshot.mode === mode) return;
			snapshot = { ...snapshot, mode };
			listeners.forEach((l) => l());
		},
		subscribe(l) {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		getSnapshot() {
			return snapshot;
		},
	};
}

const store = createStore();
const HighlightContext = createContext(true);

function format(value) {
	if (typeof value === "function") return "ƒ";
	if (typeof value === "object" && value !== null)
		return Array.isArray(value) ? `[${value.length}]` : "{…}";
	return JSON.stringify(value);
}

function diffProps(prev, next) {
	if (!prev) return "first render";
	if (!next) return "re-rendered";
	const changed = [];
	const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
	keys.forEach((key) => {
		if (key === "children") return;
		if (!Object.is(prev[key], next[key])) {
			const a = format(prev[key]);
			const b = format(next[key]);
			changed.push(
				a === b ? `${key} changed by reference (unstable identity)` : `${key}: ${a} → ${b}`,
			);
		}
	});
	if (changed.length) return `props changed — ${changed.join(", ")}`;
	if (prev !== next) return "parent re-rendered, props identical (memo candidate)";
	return "hook state or context changed";
}

function fiberName(fiber) {
	let type = fiber.type;
	if (typeof type === "string") return type;
	if (type?.type) type = type.type;
	if (type?.render) type = type.render;
	return type?.displayName || type?.name || null;
}

function providerName(fiber) {
	const ctx = fiber.type?._context ?? fiber.type;
	return ctx?.displayName || "Context";
}

function hostNode(fiber) {
	let node = fiber;
	let depth = 0;
	while (node && depth < 40) {
		if (node.tag === HOST_TAG && node.stateNode instanceof Element) return node.stateNode;
		node = node.child;
		depth += 1;
	}
	return null;
}

function domFiber(el) {
	let node = el;
	while (node) {
		const key = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
		if (key) return node[key];
		node = node.parentElement;
	}
	return null;
}

function ownerComponent(fiber) {
	let node = fiber;
	let depth = 0;
	while (node && depth < 60) {
		if (COMPONENT_TAGS.has(node.tag)) {
			const name = fiberName(node);
			if (name) return { fiber: node, name };
		}
		node = node.return;
		depth += 1;
	}
	return null;
}

function costColor(selfTime) {
	if (typeof selfTime !== "number") return [232, 232, 232];
	if (selfTime < 2) return [140, 140, 140];
	if (selfTime < 8) return [217, 185, 140];
	return [217, 140, 140];
}

function createOverlay() {
	let canvas = null;
	let ctx = null;
	let entries = [];
	let hover = null;
	let raf = 0;
	let enabled = true;

	function ensure() {
		if (canvas) return;
		canvas = document.createElement("canvas");
		canvas.setAttribute("data-devtool", "");
		Object.assign(canvas.style, {
			position: "fixed",
			inset: "0",
			width: "100vw",
			height: "100vh",
			pointerEvents: "none",
			zIndex: "2147483646",
		});
		document.body.appendChild(canvas);
		ctx = canvas.getContext("2d");
		resize();
		window.addEventListener("resize", resize);
	}

	function resize() {
		const dpr = window.devicePixelRatio || 1;
		canvas.width = window.innerWidth * dpr;
		canvas.height = window.innerHeight * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function label(rect, text, alpha, rgb) {
		if (rect.width < 70 || rect.height < 18) return;
		ctx.font = "10px Inter, system-ui, sans-serif";
		const w = ctx.measureText(text).width + 10;
		ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
		ctx.fillRect(rect.x, rect.y - 14, w, 14);
		ctx.fillStyle = `rgba(20, 20, 22, ${Math.min(1, alpha + 0.2)})`;
		ctx.fillText(text, rect.x + 5, rect.y - 4);
	}

	function draw() {
		const now = performance.now();
		ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
		entries = entries.filter((e) => now - e.start < 650);
		entries.forEach((e) => {
			const t = (now - e.start) / 650;
			const ease = 1 - Math.pow(1 - t, 3);
			const alpha = 0.9 * (1 - ease);
			const rgb = e.rgb.join(",");
			ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
			ctx.fillStyle = `rgba(${rgb}, ${alpha * 0.06})`;
			ctx.lineWidth = 1.5;
			ctx.strokeRect(e.rect.x - 1, e.rect.y - 1, e.rect.width + 2, e.rect.height + 2);
			ctx.fillRect(e.rect.x - 1, e.rect.y - 1, e.rect.width + 2, e.rect.height + 2);
			label(
				e.rect,
				`${e.name} ×${e.count}${e.selfTime ? ` · ${e.selfTime.toFixed(1)}ms` : ""}`,
				alpha,
				rgb,
			);
		});
		if (hover) {
			ctx.strokeStyle = "rgba(232, 232, 232, 0.95)";
			ctx.fillStyle = "rgba(232, 232, 232, 0.07)";
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 4]);
			ctx.strokeRect(
				hover.rect.x - 1,
				hover.rect.y - 1,
				hover.rect.width + 2,
				hover.rect.height + 2,
			);
			ctx.fillRect(
				hover.rect.x - 1,
				hover.rect.y - 1,
				hover.rect.width + 2,
				hover.rect.height + 2,
			);
			ctx.setLineDash([]);
			label(hover.rect, hover.name, 0.95, "232,232,232");
		}
		raf = entries.length || hover ? requestAnimationFrame(draw) : 0;
		if (!entries.length && !hover) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
	}

	function kick() {
		if (!raf) raf = requestAnimationFrame(draw);
	}

	return {
		flash(el, name, selfTime) {
			if (!enabled) return;
			ensure();
			const rect = el.getBoundingClientRect();
			if (!rect.width || !rect.height) return;
			const existing = entries.find(
				(e) =>
					e.name === name &&
					Math.abs(e.rect.x - rect.x) < 2 &&
					Math.abs(e.rect.y - rect.y) < 2,
			);
			if (existing) {
				existing.start = performance.now();
				existing.count += 1;
				existing.rect = rect;
				existing.selfTime = selfTime;
			} else {
				if (entries.length >= MAX_OVERLAY_ENTRIES) entries.shift();
				entries.push({
					rect,
					name,
					start: performance.now(),
					count: 1,
					selfTime,
					rgb: costColor(selfTime),
				});
			}
			kick();
		},
		setHover(el, name) {
			ensure();
			hover = el ? { rect: el.getBoundingClientRect(), name } : null;
			kick();
		},
		setEnabled(value) {
			enabled = value;
			if (!value) entries = [];
		},
		isEnabled() {
			return enabled;
		},
	};
}

const overlay = createOverlay();

let capturing = false;

function setCapturing(value) {
	capturing = value;
}

function collectTree(rootFiber) {
	const roots = [];
	const stack = [{ fiber: rootFiber, out: roots, trigger: null }];
	let count = 0;
	let truncated = false;

	while (stack.length) {
		const { fiber, out, trigger } = stack.pop();
		if (!fiber) continue;

		stack.push({ fiber: fiber.sibling, out, trigger });

		if (
			fiber.tag === HOST_TAG &&
			fiber.stateNode instanceof Element &&
			fiber.stateNode.hasAttribute("data-devtool")
		)
			continue;

		let nextTrigger = trigger;
		if (
			fiber.tag === PROVIDER_TAG &&
			fiber.alternate &&
			!Object.is(fiber.memoizedProps?.value, fiber.alternate.memoizedProps?.value)
		) {
			nextTrigger = `${providerName(fiber)} value changed`;
		}

		if (COMPONENT_TAGS.has(fiber.tag) && fiber.flags & PERFORMED_WORK) {
			const name = fiberName(fiber);
			if (name) {
				count += 1;
				if (count > MAX_NODES_PER_COMMIT) {
					truncated = true;
					continue;
				}
				const node = { name, fiber, trigger: nextTrigger, children: [] };
				out.push(node);
				stack.push({ fiber: fiber.child, out: node.children, trigger: nextTrigger });
				continue;
			}
		}
		stack.push({ fiber: fiber.child, out, trigger: nextTrigger });
	}

	return { roots, count, truncated };
}

function aggregate(nodes) {
	const merged = [];
	nodes.forEach((node) => {
		const prev = merged.find((m) => m.name === node.name);
		if (prev) {
			prev.count += 1;
			prev.children.push(...node.children);
			if (typeof node.selfTime === "number")
				prev.selfTime = (prev.selfTime ?? 0) + node.selfTime;
		} else {
			merged.push({
				name: node.name,
				count: 1,
				reason: node.reason,
				trigger: node.trigger,
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
	const existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

	const handleCommit = (root) => {
		if (!capturing) return;
		store.setMode("fiber");
		const { roots, truncated } = collectTree(root.current);
		const paint = overlay.isEnabled();
		let total = 0;

		const visit = (node, origin) => {
			const { fiber } = node;
			total += 1;
			node.reason = diffProps(fiber.alternate?.memoizedProps, fiber.memoizedProps);
			node.selfTime =
				typeof fiber.actualDuration === "number"
					? Math.max(
							0,
							fiber.actualDuration -
								node.children.reduce(
									(sum, c) => sum + (c.fiber.actualDuration ?? 0),
									0,
								),
						)
					: undefined;
			const cause = node.trigger ?? origin;
			store.report(node.name, node.reason, node.selfTime, cause);
			if (paint) {
				const el = hostNode(fiber);
				if (el) overlay.flash(el, node.name, node.selfTime);
			}
			const childOrigin = node.trigger ?? origin ?? `${node.name} state change`;
			node.children.forEach((child) => visit(child, childOrigin));
			delete node.fiber;
		};

		roots.forEach((node) => visit(node, null));
		if (total) store.commit(aggregate(roots), total, truncated);
	};

	if (existing) {
		const original = existing.onCommitFiberRoot;
		existing.onCommitFiberRoot = (id, root, ...rest) => {
			try {
				handleCommit(root);
			} catch (e) {
				void e;
			}
			return original ? original.call(existing, id, root, ...rest) : undefined;
		};
		return;
	}

	const renderers = new Map();
	let rendererId = 0;
	window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
		renderers,
		supportsFiber: true,
		inject(renderer) {
			rendererId += 1;
			renderers.set(rendererId, renderer);
			return rendererId;
		},
		onCommitFiberRoot(_, root) {
			try {
				handleCommit(root);
			} catch (e) {
				void e;
			}
		},
		onCommitFiberUnmount() {},
		onPostCommitFiberRoot() {},
		checkDCE() {},
	};
}

installFiberAgent();

function buildReport(snap, history) {
	const avg = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
	const min = Math.min(...history);
	const top = [...snap.components]
		.sort((a, b) => b.wasted - a.wasted || b.renders - a.renders)
		.slice(0, 20);

	const componentLines = top.map((c) => {
		const avgSelf = c.timed ? `${(c.selfTotal / c.timed).toFixed(1)}ms avg self` : "no timing";
		const causes = Object.entries(c.causes)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([label, n]) => `${label} ×${n}`)
			.join(", ");
		return `- ${c.name}: ${c.renders} renders, ${c.wasted} wasted, ${avgSelf}${causes ? ` | triggered by: ${causes}` : ""}\n  last reason: ${c.lastReason}`;
	});

	const treeLines = [];
	const renderTree = (nodes, depth) => {
		nodes.forEach((n) => {
			treeLines.push(
				`${"  ".repeat(depth)}${depth ? "└ " : ""}${n.count > 1 ? `${n.count}× ` : ""}${n.name}${typeof n.selfTime === "number" ? ` (${n.selfTime.toFixed(1)}ms)` : ""}${n.reason?.includes("memo candidate") ? " [WASTED]" : ""}`,
			);
			renderTree(n.children, depth + 1);
		});
	};
	snap.commits.slice(-8).forEach((commit) => {
		treeLines.push(
			`\nCommit at ${commit.time.toTimeString().slice(0, 8)} — ${commit.total} components rendered${commit.truncated ? " (truncated)" : ""}`,
		);
		renderTree(commit.roots, 0);
	});

	const longTasks = snap.logs
		.filter((l) => l.name === "main thread" || l.name === "frame budget")
		.slice(-10)
		.map((l) => `- ${l.time.toTimeString().slice(0, 8)} ${l.reason}`);

	return [
		"# React performance telemetry (Pulse devtool)",
		"",
		"You are an expert React performance engineer. Below is runtime telemetry captured from a live React app: FPS statistics, per-component render counts with wasted-render detection (renders where props were referentially identical, meaning memoization would have skipped them), render cause attribution (which state owner or context provider triggered each render), commit cascade trees showing parent→child render propagation, and main-thread long tasks.",
		"",
		`## Frame rate`,
		`Average ${avg}fps, minimum ${min}fps over the last ~22 seconds. Budget target: 60fps (16.7ms/frame).`,
		"",
		"## Components (sorted by wasted renders)",
		...componentLines,
		"",
		"## Recent commit cascades",
		...treeLines,
		"",
		"## Frame drops & long tasks",
		...(longTasks.length ? longTasks : ["- none captured"]),
		"",
		"## Your task",
		"1. Identify the components causing the most wasted work, using wasted counts, cascade trees, and self-times.",
		"2. For each, name the root cause: unstable prop identity (inline callbacks/objects), missing memo boundary, over-broad context value, or state lifted too high.",
		"3. Propose concrete fixes with code-level specificity: exactly where to add memo/useCallback/useMemo, how to split a context provider, or where React Compiler would resolve it automatically.",
		"4. Rank the fixes by expected frame-time impact and state which metric in this report each fix should improve.",
		"Do not suggest generic advice; tie every recommendation to a specific component and data point above.",
	].join("\n");
}

function useFps(onDrop, enabled) {
	const [fps, setFps] = useState(60);
	const historyRef = useRef(new Array(90).fill(60));
	const [, force] = useState(0);

	useEffect(() => {
		if (!enabled) return undefined;

		let frames = 0;
		let last = performance.now();
		let raf;
		let dropping = false;

		const loop = (now) => {
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
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [onDrop, enabled]);

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
		} catch (e) {
			return undefined;
		}
	}, []);
}

function useMeasuredHeight() {
	const innerRef = useRef(null);
	const [height, setHeight] = useState(120);

	useEffect(() => {
		const el = innerRef.current;
		if (!el) return;
		const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
		observer.observe(el);
		setHeight(el.offsetHeight);
		return () => observer.disconnect();
	}, []);

	return { innerRef, height };
}

function useDraggable() {
	const [pos, setPos] = useState(null);
	const dragRef = useRef(null);

	const onPointerDown = useCallback((e) => {
		if (
			e.target.closest("button, input, label") &&
			!e.currentTarget.classList.contains("dt-pill")
		)
			return;
		const panel = e.currentTarget.closest("[data-devtool]");
		const rect = panel.getBoundingClientRect();
		dragRef.current = {
			dx: e.clientX - rect.x,
			dy: e.clientY - rect.y,
			w: rect.width,
			h: rect.height,
			moved: false,
		};

		const move = (ev) => {
			const d = dragRef.current;
			d.moved = true;
			setPos({
				x: Math.min(Math.max(8, ev.clientX - d.dx), window.innerWidth - d.w - 8),
				y: Math.min(Math.max(8, ev.clientY - d.dy), window.innerHeight - d.h - 8),
			});
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}, []);

	const didDrag = useCallback(() => dragRef.current?.moved ?? false, []);

	return { pos, setPos, onPointerDown, didDrag };
}

function useClampIntoView(pos, setPos, ref, active, revision) {
	useLayoutEffect(() => {
		if (!active || !pos) return undefined;

		const clamp = () => {
			const el = ref.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const maxX = Math.max(8, window.innerWidth - rect.width - 8);
			const maxY = Math.max(8, window.innerHeight - rect.height - 8);
			const nx = Math.min(Math.max(8, pos.x), maxX);
			const ny = Math.min(Math.max(8, pos.y), maxY);
			if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
		};

		clamp();
		window.addEventListener("resize", clamp);
		return () => window.removeEventListener("resize", clamp);
	}, [pos, setPos, ref, active, revision]);
}

function useInspect(active, onPick) {
	useEffect(() => {
		if (!active) {
			overlay.setHover(null);
			return;
		}
		const move = (e) => {
			if (e.target.closest("[data-devtool]")) {
				overlay.setHover(null);
				return;
			}
			const owner = ownerComponent(domFiber(e.target));
			if (owner) {
				const el = hostNode(owner.fiber) ?? e.target;
				overlay.setHover(el, owner.name);
			} else {
				overlay.setHover(null);
			}
		};
		const click = (e) => {
			if (e.target.closest("[data-devtool]")) return;
			e.preventDefault();
			e.stopPropagation();
			const owner = ownerComponent(domFiber(e.target));
			if (owner) onPick(owner.name);
		};
		const key = (e) => {
			if (e.key === "Escape") onPick(null);
		};
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

function useHotkey(onToggle) {
	useEffect(() => {
		const handler = (e) => {
			if (e.key !== "`") return;
			const t = e.target;
			if (
				t instanceof HTMLElement &&
				(t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
			)
				return;
			e.preventDefault();
			onToggle();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onToggle]);
}

const FpsGraph = memo(function FpsGraph({ history, fps }) {
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
					const barHeight = Math.max(2, (value / 144) * height);
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
});

const ComponentRow = memo(function ComponentRow({ entry, now, onSelect }) {
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
});

function InspectCard({ entry, onClear }) {
	const avg = entry.timed ? entry.selfTotal / entry.timed : null;
	const wasteShare = entry.renders ? Math.round((entry.wasted / entry.renders) * 100) : 0;
	const causes = Object.entries(entry.causes)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3);
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
			{causes.length > 0 && (
				<div className="dt-causes">
					{causes.map(([label, n]) => (
						<span key={label} className="dt-badge dt-nums">
							{label} ×{n}
						</span>
					))}
				</div>
			)}
			<p className="dt-card-copy">Last reason: {entry.lastReason || "—"}</p>
		</div>
	);
}

const CommitTree = memo(function CommitTree({ nodes, depth }) {
	if (depth > 8) return <div className="dt-tree-reason">… deeper levels hidden</div>;
	return nodes.slice(0, 15).map((node) => (
		<div key={node.name} style={{ paddingLeft: depth * 14 }}>
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
			{depth === 0 && (node.trigger || node.reason) && (
				<div className="dt-tree-reason">{node.trigger ?? node.reason}</div>
			)}
			<CommitTree nodes={node.children} depth={depth + 1} />
		</div>
	));
});

const LogRow = memo(function LogRow({ log }) {
	const t = log.time.toTimeString().slice(0, 8);
	return (
		<div className="dt-log-row">
			<span className="dt-nums" style={{ color: "#525252" }}>
				{t}
			</span>
			<span style={{ color: "#737373", margin: "0 6px" }}>·</span>
			<span style={{ color: "#e5e5e5" }}>{log.name}</span>
			<span style={{ color: "#a3a3a3" }}> · {log.reason}</span>
		</div>
	);
});

const TABS = [
	["fps", "Frames"],
	["renders", "Renders"],
	["log", "Log"],
];

function Devtool({ highlight, setHighlight, trackFps, setTrackFps }) {
	const [tab, setTab] = useState("fps");
	const [collapsed, setCollapsed] = useState(true);
	const [inspecting, setInspecting] = useState(false);
	const [pinned, setPinned] = useState(null);
	const [filter, setFilter] = useState("");
	const [paused, setPaused] = useState(false);
	const [logView, setLogView] = useState("commits");
	const [sortBy, setSortBy] = useState("recent");
	const [exported, setExported] = useState(null);
	const frozenRef = useRef(null);

	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const [now, setNow] = useState(() => performance.now());
	const { pos, setPos, onPointerDown, didDrag } = useDraggable();
	const panelRef = useRef(null);

	const onDrop = useCallback((value) => {
		store.log(
			"frame budget",
			`fps dropped to ${value} — check the render log around this timestamp`,
		);
	}, []);

	const { fps, history } = useFps(onDrop, trackFps);
	useLongTasks();
	useHotkey(useCallback(() => setCollapsed((v) => !v), []));

	const onPick = useCallback((name) => {
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
		setCapturing(!collapsed);
		return () => setCapturing(false);
	}, [collapsed]);

	useEffect(() => {
		overlay.setEnabled(highlight && !collapsed);
	}, [highlight, collapsed]);

	useEffect(() => {
		if (collapsed) return;
		const id = setInterval(() => setNow(performance.now()), 1000);
		return () => clearInterval(id);
	}, [collapsed]);

	const exportReport = useCallback(
		(kind) => {
			const report = buildReport(store.getSnapshot(), history);
			if (kind === "copy") {
				navigator.clipboard?.writeText(report).catch(() => {});
			} else {
				const blob = new Blob([report], { type: "text/markdown" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `pulse-report-${Date.now()}.md`;
				a.click();
				URL.revokeObjectURL(url);
			}
			setExported(kind);
			setTimeout(() => setExported(null), 1500);
		},
		[history],
	);

	const view = paused ? (frozenRef.current ?? snap) : snap;

	const sorted = useMemo(() => {
		const list = view.components.filter(
			(c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()),
		);
		const s =
			sortBy === "wasted"
				? list.sort((a, b) => b.wasted - a.wasted || b.renders - a.renders)
				: list.sort((a, b) => b.lastRender - a.lastRender);
		return s.slice(0, 40);
	}, [view.components, filter, sortBy]);

	const logs = useMemo(
		() =>
			[...view.logs]
				.reverse()
				.filter((l) => !filter || l.name.toLowerCase().includes(filter.toLowerCase()))
				.slice(0, 60),
		[view.logs, filter, sortBy],
	);
	const commits = useMemo(() => [...view.commits].reverse().slice(0, 12), [view.commits]);
	const pinnedEntry = pinned ? view.components.find((c) => c.name === pinned) : null;

	const { innerRef, height } = useMeasuredHeight();
	const cap = Math.max(160, (typeof window === "undefined" ? 640 : window.innerHeight) - 160);
	const bodyHeight = Math.min(height, cap);

	useClampIntoView(pos, setPos, panelRef, !collapsed, bodyHeight);

	const posStyle = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : {};

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
				{trackFps ? (
					<>
						<span
							className="dt-nums"
							style={{ color: fps >= 55 ? "#e5e5e5" : "#d98c8c" }}
						>
							{fps}
						</span>
						<span className="dt-dim" style={{ fontSize: 10 }}>
							fps
						</span>
					</>
				) : (
					<span className="dt-dim" style={{ fontSize: 10 }}>
						pulse
					</span>
				)}
			</button>
		);
	}

	return (
		<aside ref={panelRef} data-devtool className="dt-panel" style={posStyle}>
			<style>{STYLES}</style>
			<header className="dt-header" onPointerDown={onPointerDown}>
				<div className="dt-row" style={{ gap: 10 }}>
					<span className="dt-logo" />
					<span className="dt-title">Pulse</span>
					{trackFps && (
						<span
							className={
								fps >= 55 ? "dt-badge dt-nums" : "dt-badge dt-badge-drop dt-nums"
							}
						>
							{fps} fps
						</span>
					)}
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
						checked={trackFps}
						onChange={(e) => setTrackFps(e.target.checked)}
					/>
					fps
				</label>
				<label className="dt-toggle">
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

			<div className="dt-body" style={{ height: bodyHeight, overflowY: "auto" }}>
				<div ref={innerRef} className="dt-body-inner">
					{tab === "fps" && trackFps && (
						<div className="dt-stack">
							<FpsGraph history={history} fps={fps} />
							<p className="dt-hint">
								Dashed line marks the 60fps budget. Outline colors on the page map
								render cost: gray under 2ms, amber under 8ms, red above.
							</p>
						</div>
					)}
					{tab === "fps" && !trackFps && (
						<p className="dt-hint">
							FPS tracking is off. Enable the "fps" checkbox above to resume.
						</p>
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
									onSelect={setPinned}
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
							{logView === "commits" &&
								commits.map((commit) => (
									<div key={commit.id} className="dt-commit">
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
												{commit.truncated ? " · truncated" : ""}
											</span>
										</div>
										<CommitTree nodes={commit.roots} depth={0} />
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
								logs.map((log) => <LogRow key={log.id} log={log} />)}
							{logView === "raw" && !logs.length && (
								<p className="dt-hint">No render events yet.</p>
							)}
						</div>
					)}
				</div>
			</div>

			<footer className="dt-footer">
				<span className="dt-dim" style={{ fontSize: 10 }}>
					` to toggle
				</span>
				<div className="dt-row" style={{ gap: 6 }}>
					<button
						className="dt-btn dt-btn-sm dt-press"
						onClick={() => exportReport("copy")}
					>
						{exported === "copy" ? "Copied" : "Copy for LLM"}
					</button>
					<button
						className="dt-btn dt-btn-sm dt-press"
						onClick={() => exportReport("download")}
					>
						{exported === "download" ? "Saved" : "Download"}
					</button>
				</div>
			</footer>
		</aside>
	);
}

const STYLES = `
  .dt-row { display: flex; align-items: center; }
  .dt-between { justify-content: space-between; }
  .dt-baseline { justify-content: space-between; align-items: baseline; }
  .dt-stack { display: flex; flex-direction: column; gap: 12px; }
  .dt-nums { font-variant-numeric: tabular-nums; }
  .dt-dim { color: #737373; }
  .dt-xs { font-size: 12px; }

  .dt-card { background: #171717; border: 1px solid #2a2a2a; padding: 16px; }
  .dt-card-title { font-size: 14px; color: #e5e5e5; }
  .dt-card-copy { margin-top: 4px; font-size: 12px; line-height: 1.55; color: #8a8a8a; }

  .dt-btn { display: block; width: 100%; background: #262626; border: 1px solid #3d3d3d; padding: 7px 12px; font-size: 12px; color: #e5e5e5; }
  .dt-btn:hover { background: #2e2e2e; }
  .dt-btn-sm { width: auto; padding: 5px 10px; }
  .dt-btn-active { background: #3a2f26; border-color: #5a4a38; color: #d9b98c; }

  .dt-icon-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: transparent; border: 1px solid transparent; color: #737373; }
  .dt-icon-btn:hover { color: #d4d4d4; background: #262626; }
  .dt-icon-active { color: #f5f5f5; background: #2e2e2e; border-color: #454545; }

  .dt-chip { background: transparent; border: none; padding: 3px 8px; font-size: 11px; color: #737373; }
  .dt-chip:hover { color: #d4d4d4; }
  .dt-chip-active { background: #2e2e2e; color: #f5f5f5; }

  .dt-panel { position: fixed; bottom: 16px; right: 16px; width: 340px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; overflow: hidden; background: #1e1e20; border: 1px solid #2e2e2e; box-shadow: 0 24px 60px rgba(0,0,0,0.55); font-family: Inter, ui-sans-serif, system-ui, sans-serif; z-index: 2147483647; }
  .dt-pill { position: fixed; bottom: 16px; right: 16px; display: flex; align-items: center; gap: 6px; padding: 7px 12px; background: #1e1e20; border: 1px solid #2e2e2e; box-shadow: 0 12px 30px rgba(0,0,0,0.5); font-size: 12px; z-index: 2147483647; cursor: pointer; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .dt-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #2a2a2a; user-select: none; cursor: grab; }
  .dt-header:active { cursor: grabbing; }
  .dt-logo { display: block; width: 14px; height: 14px; background: conic-gradient(#8c8c8c, #e8e8e8, #404040, #8c8c8c); }
  .dt-title { font-size: 14px; font-weight: 500; color: #f5f5f5; }
  .dt-toggle { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #737373; cursor: pointer; }
  .dt-toggle input { accent-color: #a3a3a3; }

  .dt-tabs { display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-bottom: 1px solid #2a2a2a; }
  .dt-tab { background: transparent; border: none; padding: 5px 10px; font-size: 12px; color: #737373; transition: color 150ms ease, background-color 150ms ease; }
  .dt-tab:hover { color: #d4d4d4; }
  .dt-tab-active { background: #2e2e2e; color: #f5f5f5; }

  .dt-filter-bar { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #2a2a2a; }
  .dt-input { flex: 1; min-width: 0; background: #171717; border: 1px solid #2e2e2e; padding: 5px 10px; font-size: 12px; color: #e5e5e5; outline: none; }
  .dt-input::placeholder { color: #5a5a5a; }
  .dt-input:focus { border-color: #454545; }

  .dt-header, .dt-tabs, .dt-filter-bar, .dt-footer { flex-shrink: 0; }
  .dt-body { flex: 1 1 auto; min-height: 0; transition: height 350ms cubic-bezier(0.23, 1, 0.32, 1); }
  .dt-body-inner { padding: 12px; }
  .dt-section-title { font-size: 13px; color: #d4d4d4; padding: 0 4px; }
  .dt-hint { padding: 0 4px; font-size: 11px; line-height: 1.6; color: #737373; }
  .dt-fps-big { font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }

  .dt-footer { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-top: 1px solid #2a2a2a; }

  .dt-comp-row { display: flex; align-items: center; justify-content: space-between; width: 100%; text-align: left; background: #1c1c1c; border: 1px solid #2a2a2a; padding: 8px 12px; }
  .dt-comp-row:hover { border-color: #3d3d3d; }
  .dt-comp-name { font-size: 13px; color: #e5e5e5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dt-dot { width: 6px; height: 6px; flex-shrink: 0; background: #525252; transition: background-color 500ms ease, box-shadow 500ms ease; }
  .dt-dot-hot { background: #e8e8e8; box-shadow: 0 0 8px rgba(232,232,232,0.5); }

  .dt-badge { padding: 2px 6px; font-size: 11px; background: #262626; color: #8a8a8a; white-space: nowrap; }
  .dt-badge-hot { background: rgba(232,232,232,0.1); color: #d4d4d4; }
  .dt-badge-drop { background: #3a2626; color: #d98c8c; }
  .dt-badge-warn { background: #34291c; color: #d9b98c; }

  .dt-inspect-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 12px 0 8px; }
  .dt-stat { font-size: 18px; font-weight: 600; color: #f5f5f5; font-variant-numeric: tabular-nums; }
  .dt-stat-label { font-size: 10px; color: #737373; margin-top: 2px; }
  .dt-causes { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }

  .dt-commit { background: #1c1c1c; border: 1px solid #2a2a2a; padding: 10px 12px; }
  .dt-tree-row { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.7; }
  .dt-tree-guide { color: #454545; font-size: 10px; }
  .dt-tree-reason { font-size: 11px; color: #8a8a8a; padding-left: 14px; margin-bottom: 2px; }

  .dt-log-row { padding: 8px 4px; font-size: 12px; line-height: 1.6; border-bottom: 1px solid rgba(42,42,42,0.6); }
  .dt-log-row:last-child { border-bottom: none; }

  .dt-press { transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1), background-color 150ms ease, color 150ms ease, border-color 150ms ease; }
  .dt-press:active { transform: scale(0.97); }

  @media (prefers-reduced-motion: reduce) {
    .dt-body { transition: none; }
  }
`;

export { Devtool };
