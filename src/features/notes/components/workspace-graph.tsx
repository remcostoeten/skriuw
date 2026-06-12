"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Waypoints } from "lucide-react";
import { useAuth } from "@/core/auth/use-auth";
import { recordGuestGraphExplore } from "@/core/workspace-backend";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { cn } from "@/shared/lib/utils";
import type { GraphData, GraphNode } from "@/domain/notes/graph";
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

function nodeColor(node: GraphNode): string {
	if (node.type === "tag") return TAG_COLOR;
	return CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length];
}

function nodeRadius(node: GraphNode): number {
	return 3 + Math.min(9, Math.sqrt(node.degree) * 2.2);
}

function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type GraphCanvasProps = {
	data: GraphData;
	onOpenNote: (id: string) => void;
	onExploreNote?: (id: string) => void;
};

function GraphCanvas({ data, onOpenNote, onExploreNote }: GraphCanvasProps) {
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
			const s = typeof (edge.source as any) === "object" ? (edge.source as any).id : edge.source;
			// biome-ignore lint/suspicious/noExplicitAny: runtime shape from force-graph
			const t = typeof (edge.target as any) === "object" ? (edge.target as any).id : edge.target;
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

	// Capture latest values in refs so canvas callbacks never go stale.
	const hoveredIdRef = useRef(hoveredId);
	const neighborsRef = useRef(neighbors);
	useEffect(() => { hoveredIdRef.current = hoveredId; }, [hoveredId]);
	useEffect(() => { neighborsRef.current = neighbors; }, [neighbors]);

	const handleNodeClick = useCallback(
		(node: GraphNode) => {
			if (node.type !== "note") return;
			onExploreNote?.(node.id);
			onOpenNote(node.id);
		},
		[onExploreNote, onOpenNote],
	);

	const handleNodeHover = useCallback((node: GraphNode | null) => {
		setHoveredId(node ? node.id : null);
	}, []);

	const handleEngineStop = useCallback(() => {
		if (!hasFitRef.current) {
			hasFitRef.current = true;
			graphRef.current?.zoomToFit(600, 80);
		}
	}, []);

	const getNodeColor = useCallback((node: GraphNode): string => {
		const hovered = hoveredIdRef.current;
		const nbrs = neighborsRef.current;
		const base = nodeColor(node);
		if (!hovered) return base;
		if (node.id === hovered || nbrs?.has(node.id)) return base;
		return hexToRgba(base, 0.1);
	}, []);

	// biome-ignore lint/suspicious/noExplicitAny: runtime link shape from force-graph
	const getLinkColor = useCallback((link: any): string => {
		const hovered = hoveredIdRef.current;
		const s = typeof link.source === "object" ? link.source.id : link.source;
		const t = typeof link.target === "object" ? link.target.id : link.target;
		if (!hovered) {
			return link.kind === "note"
				? "rgba(148, 163, 184, 0.38)"
				: "rgba(100, 116, 139, 0.22)";
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

	const drawNode = useCallback(
		// biome-ignore lint/suspicious/noExplicitAny: canvas ctx + node from force-graph
		(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
			const typed = node as GraphNode & { x?: number; y?: number };
			if (typed.x === undefined || typed.y === undefined) return;

			const r = nodeRadius(typed);
			const color = getNodeColor(typed);
			const hovered = hoveredIdRef.current;
			const isHovered = typed.id === hovered;
			const isTag = typed.type === "tag";
			const isHub = typed.degree >= 4;

			// Glow halo
			if (isHovered || isHub) {
				ctx.shadowColor = nodeColor(typed);
				ctx.shadowBlur = isHovered ? 20 : 8;
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
			}

			// Labels — hubs show early; everything else on deep zoom; hovered always
			const showLabel =
				isHovered ||
				(isHub && globalScale >= 0.7) ||
				(isTag && globalScale >= 1.0) ||
				(typed.degree >= 2 && globalScale >= 1.5);

			if (showLabel) {
				const fontSize = Math.max(2.5, 10 / globalScale);
				ctx.font = `${isHub ? "500" : "400"} ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
				ctx.fillStyle = isHovered
					? "rgba(248, 250, 252, 1)"
					: "rgba(226, 232, 240, 0.82)";
				ctx.textAlign = "center";
				ctx.textBaseline = "top";
				ctx.fillText(typed.label, typed.x, typed.y + r + 2);
			}
		},
		[getNodeColor],
	);

	return (
		<div ref={containerRef} className="relative h-full w-full">
			{size.width > 0 && (
				<ForceGraph2D
					ref={graphRef}
					width={size.width}
					height={size.height}
					graphData={graphData}
					backgroundColor="transparent"
					nodeRelSize={1}
					nodeVal={(node) => nodeRadius(node as GraphNode) ** 2}
					nodeColor={(node) => getNodeColor(node as GraphNode)}
					nodeLabel={(node) => {
						const typed = node as GraphNode;
						return `${typed.label} · ${typed.degree} link${typed.degree === 1 ? "" : "s"}`;
					}}
					linkColor={getLinkColor}
					linkWidth={getLinkWidth}
					linkDirectionalParticles={2}
					linkDirectionalParticleSpeed={0.003}
					linkDirectionalParticleWidth={getParticleWidth}
					linkDirectionalParticleColor={getParticleColor}
					onNodeClick={(node) => handleNodeClick(node as GraphNode)}
					onNodeHover={(node) => handleNodeHover(node as GraphNode | null)}
					cooldownTicks={150}
					onEngineStop={handleEngineStop}
					nodeCanvasObjectMode={() => "replace"}
					nodeCanvasObject={drawNode}
				/>
			)}
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

function MetricsOverlay({
	data,
	onOpenNote,
}: {
	data: GraphData;
	onOpenNote: (id: string) => void;
}) {
	const { metrics } = data;
	return (
		<div className="pointer-events-none absolute left-4 top-4 z-10 flex w-64 max-w-[calc(100%-2rem)] flex-col gap-4">
			<div className="pointer-events-auto border border-border bg-card/90 p-4 backdrop-blur">
				<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
					<Waypoints className="h-4 w-4" strokeWidth={1.7} />
					Workspace graph
				</div>
				<div className="flex flex-col gap-1.5">
					<MetricRow label="Notes" value={metrics.noteCount} />
					<MetricRow label="Tags" value={metrics.tagCount} />
					<MetricRow label="Connections" value={metrics.edgeCount} />
					<MetricRow label="Clusters" value={metrics.clusterCount} />
					<MetricRow label="Orphans" value={metrics.orphanCount} />
				</div>
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
		<div className={cn("flex h-full flex-col items-center justify-center gap-4 p-8 text-center", className)}>
			<Waypoints className="h-10 w-10 text-muted-foreground" strokeWidth={1.4} />
			<div className="max-w-md space-y-2">
				<p className="text-sm font-medium text-foreground">Your note web starts with links</p>
				<p className="text-sm text-muted-foreground">
					Connect notes with <code className="font-mono">[[wiki links]]</code>, mentions, and{" "}
					<code className="font-mono">#tags</code>. The demo workspace already has a small web — open
					the welcome note to see how it links to the handbook and workflow guide.
				</p>
			</div>
			{onOpenStarterNote ? (
				<button
					type="button"
					onClick={onOpenStarterNote}
					className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent"
				>
					Open welcome note
				</button>
			) : (
				<Link
					href="/app"
					className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent"
				>
					Back to notes
				</Link>
			)}
		</div>
	);
}

/** Active seed bundle ref for the welcome note — matches guest-bundle refToId(). */
const GUEST_WELCOME_NOTE_ID = "guest:note-welcome";

export function WorkspaceGraph() {
	const router = useRouter();
	const auth = useAuth();
	const query = useNoteGraph();
	const isGuest = auth.isReady && auth.phase !== "authenticated";

	const openNote = useCallback(
		(id: string) => router.push(`/app?note=${id}`),
		[router],
	);
	const handleOpenSettings = useCallback(() => router.push("/app/settings"), [router]);
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

	const data = query.data;
	const hasGraph = Boolean(data && data.nodes.length > 0);
	const hasConnections = Boolean(data && data.edges.length > 0);

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<IconRail onOpenSettings={handleOpenSettings} />
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
							<MetricsOverlay data={data!} onOpenNote={openNote} />
							<GraphCanvas
								data={data!}
								onOpenNote={openNote}
								onExploreNote={handleExploreNote}
							/>
						</>
					)}
				</div>
			</div>
		</LayoutContainer>
	);
}
