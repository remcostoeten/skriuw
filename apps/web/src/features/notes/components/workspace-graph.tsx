"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus, Waypoints } from "lucide-react";
import { useAuth } from "@/core/auth/use-auth";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { recordGuestGraphExplore } from "@/core/workspace-backend";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import {
	graphNodeKey,
	type GraphData,
	type GraphNode,
	type GraphNodeType,
} from "@/domain/notes/graph";
import { NotesEmptyState } from "./notes-empty-state";
import { useNoteGraph } from "../hooks/use-note-graph";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const CLUSTER_COLORS = [
	"#6366f1",
	"#ec4899",
	"#14b8a6",
	"#f59e0b",
	"#8b5cf6",
	"#ef4444",
	"#10b981",
	"#3b82f6",
	"#f97316",
	"#a855f7",
];

const TAG_COLOR = "#64748b";
const PERSON_COLOR = "#cbd5e1";
const JOURNAL_COLOR = "#f59e0b";

function nodeColor(node: GraphNode): string {
	if (node.type === "tag") return TAG_COLOR;
	if (node.type === "person") return PERSON_COLOR;
	if (node.type === "journal") return JOURNAL_COLOR;
	return CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length];
}

function nodeRadius(node: GraphNode, mobile = false): number {
	const base = 3 + Math.min(9, Math.sqrt(node.degree) * 2.2);
	// Larger nodes on touch screens give a bigger hit area for thumbs.
	return mobile ? base * 1.4 : base;
}

function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type SimulationNode = GraphNode & { x?: number; y?: number; vx?: number; vy?: number };

/** Nodes below this cluster size get no island anchor or hull — mostly orphans. */
const ISLAND_MIN_SIZE = 3;

/** Zoom bounds shared by the ForceGraph2D instance and the manual zoom buttons. */
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 12;
const ZOOM_STEP = 1.5;

/**
 * On mobile the node-type filter bar sits at the bottom of the canvas, so the
 * zoom controls have to clear it: its 44px hit target plus the 1.5 units of
 * padding on its wrapper (3.5rem), plus the wrapper's own 0.75rem bottom inset
 * and a 0.5rem gap.
 */
const MOBILE_FILTER_BAR_CLEARANCE = "4.75rem";

/**
 * Assigns each sufficiently large cluster an anchor point on a golden-angle
 * spiral (big clusters near the center) so the islands spread evenly instead
 * of queuing on a line. Spacing scales with cluster size so dense islands
 * get more room.
 */
function computeClusterAnchors(nodes: GraphNode[]): Map<number, { x: number; y: number }> {
	const sizes = new Map<number, number>();
	for (const node of nodes) {
		sizes.set(node.cluster, (sizes.get(node.cluster) ?? 0) + 1);
	}
	const islands = [...sizes.entries()]
		.filter(([, size]) => size >= ISLAND_MIN_SIZE)
		.toSorted((a, b) => b[1] - a[1]);

	const anchors = new Map<number, { x: number; y: number }>();
	const goldenAngle = Math.PI * (3 - Math.sqrt(5));
	islands.forEach(([cluster, size], index) => {
		const radius = (55 + Math.sqrt(size) * 14) * Math.sqrt(index);
		const angle = index * goldenAngle;
		anchors.set(cluster, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
	});
	return anchors;
}

/**
 * A d3-force pulling every node toward its cluster's island anchor. Weak on
 * purpose — link/charge forces still shape each island internally, the anchor
 * only decides where the island settles. Tiny clusters (orphans) have no
 * anchor and are left to the other forces.
 */
function makeClusterForce(anchors: Map<number, { x: number; y: number }>) {
	let nodes: SimulationNode[] = [];
	function force(alpha: number) {
		for (const node of nodes) {
			const anchor = anchors.get(node.cluster);
			if (!anchor || node.x === undefined || node.y === undefined) continue;
			node.vx = (node.vx ?? 0) + (anchor.x - node.x) * 0.08 * alpha;
			node.vy = (node.vy ?? 0) + (anchor.y - node.y) * 0.08 * alpha;
		}
	}
	force.initialize = (simulationNodes: SimulationNode[]) => {
		nodes = simulationNodes;
	};
	return force;
}

/** Andrew's monotone chain; returns hull points in counter-clockwise order. */
function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
	if (points.length < 3) return points;
	const sorted = points.toSorted((a, b) => a.x - b.x || a.y - b.y);
	const cross = (
		o: { x: number; y: number },
		a: { x: number; y: number },
		b: { x: number; y: number },
	) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Array<{ x: number; y: number }> = [];
	for (const point of sorted) {
		while (
			lower.length >= 2 &&
			cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
		)
			lower.pop();
		lower.push(point);
	}
	const upper: Array<{ x: number; y: number }> = [];
	for (const point of sorted.toReversed()) {
		while (
			upper.length >= 2 &&
			cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
		)
			upper.pop();
		upper.push(point);
	}
	lower.pop();
	upper.pop();
	return [...lower, ...upper];
}

/**
 * Fills a soft rounded blob around a cluster's nodes: the convex hull is both
 * filled and stroked with a fat round-join stroke, which expands it by the
 * padding and rounds every corner without any curve math.
 */
function drawIslandHull(
	ctx: CanvasRenderingContext2D,
	points: Array<{ x: number; y: number }>,
	color: string,
	padding: number,
) {
	const hull = convexHull(points);
	if (hull.length === 0) return;
	ctx.beginPath();
	ctx.moveTo(hull[0].x, hull[0].y);
	for (let i = 1; i < hull.length; i += 1) ctx.lineTo(hull[i].x, hull[i].y);
	ctx.closePath();
	ctx.fillStyle = hexToRgba(color, 0.07);
	ctx.strokeStyle = hexToRgba(color, 0.07);
	ctx.lineWidth = padding * 2;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.stroke();
	ctx.fill();
}

type GraphCanvasProps = {
	data: GraphData;
	onOpenNote: (id: string) => void;
	onOpenTag: (name: string) => void;
	onOpenPerson: (id: string) => void;
	onOpenJournal: (dateKey: string) => void;
	onExploreNote?: (id: string) => void;
	isMobile: boolean;
};

function GraphCanvas({
	data,
	onOpenNote,
	onOpenTag,
	onOpenPerson,
	onOpenJournal,
	onExploreNote,
	isMobile,
}: GraphCanvasProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	// biome-ignore lint/suspicious/noExplicitAny: react-force-graph-2d has no exported ref type
	const graphRef = useRef<any>(null);
	const hasFitRef = useRef(false);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect) setSize({ width: rect.width, height: rect.height });
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// Neighbors of the hovered node for highlight dimming.
	const neighbors = useMemo<Set<string> | null>(() => {
		if (!hoveredId) return null;
		const set = new Set<string>();
		for (const edge of data.edges) {
			// After simulation starts, source/target may be node objects.
			// biome-ignore lint/suspicious/noExplicitAny: runtime shape from force-graph
			const s =
				typeof (edge.source as any) === "object" ? (edge.source as any).id : edge.source;
			// biome-ignore lint/suspicious/noExplicitAny: runtime shape from force-graph
			const t =
				typeof (edge.target as any) === "object" ? (edge.target as any).id : edge.target;
			if (s === hoveredId) set.add(t);
			if (t === hoveredId) set.add(s);
		}
		return set;
	}, [hoveredId, data.edges]);

	// Clone so the query cache stays immutable.
	const graphData = useMemo(
		() => ({
			nodes: data.nodes.map((node) => ({ ...node })),
			links: data.edges.map((edge) => ({ ...edge })),
		}),
		[data],
	);

	// The canvas is lazy-loaded, so the ref may still be empty when effects
	// first run — the engine-tick callback retries until the instance exists,
	// and the guard keeps re-registration to once per dataset.
	const clusterForNodes = useRef<GraphData["nodes"] | null>(null);
	const ensureClusterForce = useCallback(() => {
		const graph = graphRef.current;
		if (!graph || clusterForNodes.current === data.nodes) return;
		clusterForNodes.current = data.nodes;

		const anchors = computeClusterAnchors(data.nodes);
		if (anchors.size === 0) {
			graph.d3Force("cluster", null);
			return;
		}
		graph.d3Force("cluster", makeClusterForce(anchors));
		graph.d3ReheatSimulation?.();
	}, [data.nodes]);

	useEffect(() => {
		ensureClusterForce();
	}, [ensureClusterForce]);

	// Capture latest values in refs so canvas callbacks never go stale.
	const hoveredIdRef = useRef(hoveredId);
	const neighborsRef = useRef(neighbors);
	useEffect(() => {
		hoveredIdRef.current = hoveredId;
	}, [hoveredId]);
	useEffect(() => {
		neighborsRef.current = neighbors;
	}, [neighbors]);

	const handleNodeClick = useCallback(
		(node: GraphNode) => {
			if (node.type === "tag") {
				onOpenTag(graphNodeKey(node.id, "tag"));
				return;
			}
			if (node.type === "person") {
				onOpenPerson(graphNodeKey(node.id, "person"));
				return;
			}
			if (node.type === "journal") {
				onOpenJournal(graphNodeKey(node.id, "journal"));
				return;
			}
			onExploreNote?.(node.id);
			onOpenNote(node.id);
		},
		[onExploreNote, onOpenNote, onOpenPerson, onOpenJournal, onOpenTag],
	);

	const handleNodeHover = useCallback((node: GraphNode | null) => {
		setHoveredId(node ? node.id : null);
	}, []);

	const handleEngineStop = useCallback(() => {
		if (!hasFitRef.current) {
			hasFitRef.current = true;
			graphRef.current?.zoomToFit(600, isMobile ? 32 : 80);
		}
	}, [isMobile]);

	// Re-fit the camera whenever the filtered node/edge set changes — a
	// filtered graph's simulation settles at different coordinates, and
	// without this the view stays at the last fit (often off-screen).
	useEffect(() => {
		hasFitRef.current = false;
	}, [data]);

	const getNodeColor = useCallback((node: GraphNode): string => {
		const hovered = hoveredIdRef.current;
		const nbrs = neighborsRef.current;
		const base = nodeColor(node);
		if (!hovered) return base;
		if (node.id === hovered || nbrs?.has(node.id)) return base;
		return hexToRgba(base, 0.1);
	}, []);

	// biome-ignore lint/suspicious/noExplicitAny: runtime node shape from force-graph
	const nodeColorAccessor = useCallback(
		(node: any): string => getNodeColor(node as GraphNode),
		[getNodeColor],
	);

	// biome-ignore lint/suspicious/noExplicitAny: runtime node shape from force-graph
	const nodeValAccessor = useCallback(
		(node: any): number => nodeRadius(node as GraphNode, isMobile) ** 2,
		[isMobile],
	);

	// biome-ignore lint/suspicious/noExplicitAny: runtime node shape from force-graph
	const nodeLabelAccessor = useCallback((node: any): string => {
		const typed = node as GraphNode;
		return `${typed.label} · ${typed.degree} link${typed.degree === 1 ? "" : "s"}`;
	}, []);

	// biome-ignore lint/suspicious/noExplicitAny: runtime link shape from force-graph
	const getLinkColor = useCallback((link: any): string => {
		const hovered = hoveredIdRef.current;
		const s = typeof link.source === "object" ? link.source.id : link.source;
		const t = typeof link.target === "object" ? link.target.id : link.target;
		if (!hovered) {
			return link.kind === "note" ? "rgba(148, 163, 184, 0.38)" : "rgba(100, 116, 139, 0.22)";
		}
		const isActive = s === hovered || t === hovered;
		return isActive ? "rgba(203, 213, 225, 0.9)" : "rgba(148, 163, 184, 0.06)";
	}, []);

	// biome-ignore lint/suspicious/noExplicitAny: runtime link shape
	const getLinkWidth = useCallback((link: any): number => {
		const hovered = hoveredIdRef.current;
		if (!hovered) return 0.7;
		const s = typeof link.source === "object" ? link.source.id : link.source;
		const t = typeof link.target === "object" ? link.target.id : link.target;
		return s === hovered || t === hovered ? 1.8 : 0.35;
	}, []);

	// biome-ignore lint/suspicious/noExplicitAny: runtime link shape
	const getParticleColor = useCallback((link: any): string => {
		const hovered = hoveredIdRef.current;
		const s = typeof link.source === "object" ? link.source.id : link.source;
		const t = typeof link.target === "object" ? link.target.id : link.target;
		if (hovered && s !== hovered && t !== hovered) return "rgba(0,0,0,0)";
		return "rgba(148, 163, 184, 0.75)";
	}, []);

	// biome-ignore lint/suspicious/noExplicitAny: runtime link shape
	const getParticleWidth = useCallback((link: any): number => {
		const hovered = hoveredIdRef.current;
		if (!hovered) return 1.4;
		const s = typeof link.source === "object" ? link.source.id : link.source;
		const t = typeof link.target === "object" ? link.target.id : link.target;
		return s === hovered || t === hovered ? 2.5 : 0;
	}, []);

	// Islands are drawn behind nodes/links each frame; the simulation mutates
	// x/y on the cloned graphData nodes, so grouping here sees live positions.
	const drawIslands = useCallback(
		(ctx: CanvasRenderingContext2D) => {
			const byCluster = new Map<number, Array<{ x: number; y: number }>>();
			for (const node of graphData.nodes as SimulationNode[]) {
				if (node.x === undefined || node.y === undefined) continue;
				const bucket = byCluster.get(node.cluster);
				if (bucket) bucket.push({ x: node.x, y: node.y });
				else byCluster.set(node.cluster, [{ x: node.x, y: node.y }]);
			}
			for (const [cluster, points] of byCluster) {
				if (points.length < ISLAND_MIN_SIZE) continue;
				drawIslandHull(ctx, points, CLUSTER_COLORS[cluster % CLUSTER_COLORS.length], 16);
			}
		},
		[graphData],
	);

	const drawNode = useCallback(
		// biome-ignore lint/suspicious/noExplicitAny: canvas ctx + node from force-graph
		(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
			const typed = node as GraphNode & { x?: number; y?: number };
			if (typed.x === undefined || typed.y === undefined) return;

			const r = nodeRadius(typed, isMobile);
			const color = getNodeColor(typed);
			const hovered = hoveredIdRef.current;
			const isHovered = typed.id === hovered;
			const isTag = typed.type === "tag";
			const isHub = typed.degree >= 4;

			// Glow halo — shadowBlur is a software-rasterized blur with no GPU fast
			// path, so it's reserved for the single hovered node. Hub nodes get a
			// cheap stroked ring below instead (drawn per-frame for every hub, so
			// it must be cheap).
			if (isHovered) {
				ctx.shadowColor = nodeColor(typed);
				ctx.shadowBlur = 20;
			}

			if (isTag) {
				// Diamond shape for tag nodes
				const s = r * 1.15;
				ctx.beginPath();
				ctx.moveTo(typed.x, typed.y - s);
				ctx.lineTo(typed.x + s, typed.y);
				ctx.lineTo(typed.x, typed.y + s);
				ctx.lineTo(typed.x - s, typed.y);
				ctx.closePath();
				ctx.fillStyle = color;
				ctx.fill();
			} else if (typed.type === "person") {
				// Rounded square for person nodes
				const s = r * 1.05;
				ctx.beginPath();
				ctx.roundRect(typed.x - s, typed.y - s, s * 2, s * 2, s * 0.45);
				ctx.fillStyle = color;
				ctx.fill();
			} else {
				ctx.beginPath();
				ctx.arc(typed.x, typed.y, r, 0, 2 * Math.PI);
				ctx.fillStyle = color;
				ctx.fill();
			}

			ctx.shadowBlur = 0;

			// Selection ring on hover
			if (isHovered) {
				ctx.beginPath();
				ctx.arc(typed.x, typed.y, r + 2.5, 0, 2 * Math.PI);
				ctx.strokeStyle = hexToRgba(nodeColor(typed), 0.7);
				ctx.lineWidth = 1.2 / globalScale;
				ctx.stroke();
			} else if (isHub) {
				ctx.beginPath();
				ctx.arc(typed.x, typed.y, r + 1.5, 0, 2 * Math.PI);
				ctx.strokeStyle = hexToRgba(nodeColor(typed), 0.35);
				ctx.lineWidth = 1 / globalScale;
				ctx.stroke();
			}

			// Labels — hubs show early; everything else on deep zoom; hovered always
			const showLabel =
				isHovered ||
				(isHub && globalScale >= 0.7) ||
				((isTag || typed.type === "person") && globalScale >= 1.0) ||
				(typed.degree >= 2 && globalScale >= 1.5);

			if (showLabel) {
				const fontSize = Math.max(2.5, 10 / globalScale);
				ctx.font = `${isHub ? "500" : "400"} ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
				ctx.fillStyle = isHovered ? "rgba(248, 250, 252, 1)" : "rgba(226, 232, 240, 0.82)";
				ctx.textAlign = "center";
				ctx.textBaseline = "top";
				ctx.fillText(typed.label, typed.x, typed.y + r + 2);
			}
		},
		[getNodeColor, isMobile],
	);

	const zoomBy = useCallback((factor: number) => {
		const graph = graphRef.current;
		if (!graph) return;
		const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, graph.zoom() * factor));
		graph.zoom(next, 250);
	}, []);

	const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
	const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);
	const fitView = useCallback(() => {
		graphRef.current?.zoomToFit(500, isMobile ? 32 : 80);
	}, [isMobile]);

	return (
		<div
			ref={containerRef}
			className="relative h-full w-full [&_canvas]:touch-none"
			style={{
				cursor: hoveredId ? "pointer" : undefined,
				overscrollBehavior: "none",
			}}
		>
			<GraphZoomControls
				onZoomIn={zoomIn}
				onZoomOut={zoomOut}
				onFit={fitView}
				isMobile={isMobile}
			/>
			{size.width > 0 && (
				<ForceGraph2D
					ref={graphRef}
					width={size.width}
					height={size.height}
					graphData={graphData}
					backgroundColor="transparent"
					enableZoomInteraction
					enablePanInteraction
					minZoom={MIN_ZOOM}
					maxZoom={MAX_ZOOM}
					nodeRelSize={1}
					nodeVal={nodeValAccessor}
					nodeColor={nodeColorAccessor}
					nodeLabel={nodeLabelAccessor}
					linkColor={getLinkColor}
					linkWidth={getLinkWidth}
					linkDirectionalParticles={2}
					linkDirectionalParticleSpeed={0.003}
					linkDirectionalParticleWidth={getParticleWidth}
					linkDirectionalParticleColor={getParticleColor}
					onNodeClick={(node) => handleNodeClick(node as GraphNode)}
					onNodeHover={(node) => handleNodeHover(node as GraphNode | null)}
					cooldownTicks={150}
					onEngineTick={ensureClusterForce}
					onEngineStop={handleEngineStop}
					onRenderFramePre={drawIslands}
					nodeCanvasObjectMode={() => "replace"}
					nodeCanvasObject={drawNode}
				/>
			)}
		</div>
	);
}

function GraphZoomControls({
	onZoomIn,
	onZoomOut,
	onFit,
	isMobile,
}: {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFit: () => void;
	isMobile: boolean;
}) {
	const buttonClass = `flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground ${
		isMobile ? "h-11 w-11" : "h-8 w-8"
	}`;
	return (
		<div
			className="absolute right-3 z-10 flex flex-col divide-y divide-border/60 overflow-hidden rounded-md border border-border bg-card/90 backdrop-blur"
			style={{
				bottom: isMobile
					? `calc(env(safe-area-inset-bottom) + ${MOBILE_FILTER_BAR_CLEARANCE})`
					: "1rem",
			}}
		>
			<button type="button" aria-label="Zoom in" onClick={onZoomIn} className={buttonClass}>
				<Plus className="h-4 w-4" strokeWidth={1.7} />
			</button>
			<button type="button" aria-label="Zoom out" onClick={onZoomOut} className={buttonClass}>
				<Minus className="h-4 w-4" strokeWidth={1.7} />
			</button>
			<button
				type="button"
				aria-label="Fit graph to view"
				onClick={onFit}
				className={buttonClass}
			>
				<Maximize className="h-4 w-4" strokeWidth={1.7} />
			</button>
		</div>
	);
}

function GraphLegend() {
	return (
		<div className="flex flex-col gap-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
			<div className="flex items-center gap-2">
				<svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" aria-hidden>
					<circle cx="6" cy="6" r="5" fill={CLUSTER_COLORS[0]} />
				</svg>
				<span>Note — color marks its cluster</span>
			</div>
			<div className="flex items-center gap-2">
				<svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" aria-hidden>
					<path d="M6 0 L12 6 L6 12 L0 6 Z" fill={TAG_COLOR} />
				</svg>
				<span>Tag</span>
			</div>
			<div className="flex items-center gap-2">
				<svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" aria-hidden>
					<rect x="0.5" y="0.5" width="11" height="11" rx="3" fill={PERSON_COLOR} />
				</svg>
				<span>Person</span>
			</div>
			<p className="pt-1 leading-relaxed">
				Bigger = more connections. Each tinted island is a cluster of related notes. Click
				any node to open it.
			</p>
		</div>
	);
}

function MetricRow({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex items-center justify-between gap-6 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium tabular-nums">{value}</span>
		</div>
	);
}

type NodeTypeVisibility = Record<GraphNodeType, boolean>;

const NODE_TYPE_FILTERS: Array<{ type: GraphNodeType; label: string }> = [
	{ type: "note", label: "Notes" },
	{ type: "journal", label: "Journal" },
	{ type: "tag", label: "Tags" },
	{ type: "person", label: "People" },
];

function MetricsOverlay({
	data,
	onOpenNote,
	visible,
	onToggleType,
	isMobile,
}: {
	data: GraphData;
	onOpenNote: (id: string) => void;
	visible: NodeTypeVisibility;
	onToggleType: (type: GraphNodeType) => void;
	isMobile: boolean;
}) {
	const { metrics } = data;

	if (isMobile) {
		return (
			<div
				className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-3"
				style={{
					paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
					paddingLeft: "calc(env(safe-area-inset-left) + 0.75rem)",
					paddingRight: "calc(env(safe-area-inset-right) + 0.75rem)",
				}}
			>
				<div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card/90 p-1.5 backdrop-blur">
					{NODE_TYPE_FILTERS.map((filter) => (
						<button
							key={filter.type}
							type="button"
							aria-pressed={visible[filter.type]}
							onClick={() => onToggleType(filter.type)}
							className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-4 text-sm transition-colors ${
								visible[filter.type]
									? "bg-muted text-foreground"
									: "text-muted-foreground"
							}`}
						>
							{filter.label}
						</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="pointer-events-none absolute left-4 top-4 z-10 flex w-64 max-w-[calc(100%-2rem)] flex-col gap-4">
			<div className="pointer-events-auto border border-border bg-card/90 p-4 backdrop-blur">
				<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
					<Waypoints className="h-4 w-4" strokeWidth={1.7} />
					Workspace graph
				</div>
				<div className="mb-3 flex items-center gap-1.5">
					{NODE_TYPE_FILTERS.map((filter) => (
						<button
							key={filter.type}
							type="button"
							aria-pressed={visible[filter.type]}
							onClick={() => onToggleType(filter.type)}
							className={`rounded-[4px] border px-2 py-0.5 text-xs transition-colors ${
								visible[filter.type]
									? "border-ring/60 bg-muted text-foreground"
									: "border-border/60 text-muted-foreground hover:text-foreground"
							}`}
						>
							{filter.label}
						</button>
					))}
				</div>
				<div className="mb-3 flex flex-col gap-1.5">
					<MetricRow label="Notes" value={metrics.noteCount} />
					<MetricRow label="Journal" value={metrics.journalCount} />
					<MetricRow label="Tags" value={metrics.tagCount} />
					<MetricRow label="People" value={metrics.personCount} />
					<MetricRow label="Connections" value={metrics.edgeCount} />
					<MetricRow label="Clusters" value={metrics.clusterCount} />
					<MetricRow label="Orphans" value={metrics.orphanCount} />
				</div>
				<GraphLegend />
			</div>

			{metrics.topHubs.length > 0 && (
				<div className="pointer-events-auto border border-border bg-card/90 p-4 backdrop-blur">
					<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Most connected
					</div>
					<ul className="flex flex-col gap-1">
						{metrics.topHubs.map((hub) => (
							<li key={hub.id}>
								<button
									type="button"
									onClick={() => onOpenNote(hub.id)}
									className="flex w-full items-center justify-between gap-3 py-0.5 text-left text-sm transition-colors hover:text-foreground"
								>
									<span className="truncate text-muted-foreground hover:text-foreground">
										{hub.label}
									</span>
									<span className="shrink-0 tabular-nums text-xs text-muted-foreground">
										{hub.degree}
									</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

function GraphEmptyState({
	className,
	onOpenStarterNote,
}: {
	className?: string;
	onOpenStarterNote?: () => void;
}) {
	return (
		<NotesEmptyState
			className={className}
			title="Your note web starts with links"
			description={
				<>
					Connect notes with <code className="font-mono">[[wiki links]]</code>, mentions,
					and <code className="font-mono">#tags</code>. The demo workspace already has a
					small web — open the starter note to see how its project brief connects research
					and delivery.
				</>
			}
			action={
				onOpenStarterNote
					? { label: "Open starter note", onClick: onOpenStarterNote }
					: { label: "Back to notes", href: "/app" }
			}
		/>
	);
}

/** Active seed bundle ref for the welcome note — matches guest-bundle refToId(). */
const GUEST_WELCOME_NOTE_ID = "guest:note-welcome";

export function WorkspaceGraph() {
	const router = useRouter();
	const auth = useAuth();
	const isMobile = useIsMobile();
	const query = useNoteGraph();
	const isGuest = auth.isReady && auth.phase !== "authenticated";
	const [visible, setVisible] = useState<NodeTypeVisibility>({
		note: true,
		journal: true,
		tag: true,
		person: true,
	});

	const toggleType = useCallback((type: GraphNodeType) => {
		setVisible((current) => ({ ...current, [type]: !current[type] }));
	}, []);

	const openNote = useCallback((id: string) => router.push(`/app?note=${id}`), [router]);
	const openTag = useCallback(
		(name: string) => router.push(`/app/tags/${encodeURIComponent(name)}`),
		[router],
	);
	const openPerson = useCallback((id: string) => router.push(`/app/people/${id}`), [router]);
	const openJournal = useCallback(
		(dateKey: string) => router.push(`/app/journal?date=${encodeURIComponent(dateKey)}`),
		[router],
	);
	const handleExploreNote = useCallback(
		(_id: string) => {
			if (isGuest) recordGuestGraphExplore();
		},
		[isGuest],
	);
	const openStarterNote = useCallback(
		() => router.push(`/app?note=${GUEST_WELCOME_NOTE_ID}`),
		[router],
	);

	// Hide filtered-out node types; an edge survives only when both of its
	// endpoints are still visible. Metrics keep the unfiltered totals.
	const data = useMemo<GraphData | undefined>(() => {
		const full = query.data;
		if (!full) return undefined;
		if (visible.note && visible.journal && visible.tag && visible.person) return full;
		const nodes = full.nodes.filter((node) => visible[node.type]);
		const visibleIds = new Set(nodes.map((node) => node.id));
		const edges = full.edges.filter(
			(edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
		);
		return { ...full, nodes, edges };
	}, [query.data, visible]);

	// Empty-state checks look at the unfiltered graph so toggling every type
	// off still leaves the filter chips reachable.
	const hasGraph = Boolean(query.data && query.data.nodes.length > 0);
	const hasConnections = Boolean(query.data && query.data.edges.length > 0);

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<div className="relative min-w-0 flex-1">
					{query.isPending ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Building your graph…
						</div>
					) : !hasGraph || !hasConnections ? (
						<GraphEmptyState
							onOpenStarterNote={isGuest ? openStarterNote : undefined}
						/>
					) : (
						<>
							<MetricsOverlay
								data={data!}
								onOpenNote={openNote}
								visible={visible}
								onToggleType={toggleType}
								isMobile={isMobile}
							/>
							<GraphCanvas
								data={data!}
								onOpenNote={openNote}
								onOpenTag={openTag}
								onOpenPerson={openPerson}
								onOpenJournal={openJournal}
								onExploreNote={handleExploreNote}
								isMobile={isMobile}
							/>
						</>
					)}
				</div>
			</div>
		</LayoutContainer>
	);
}
