"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Waypoints } from "lucide-react";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { cn } from "@/shared/lib/utils";
import type { GraphData, GraphNode } from "@/domain/notes/graph";
import { useNoteGraph } from "../hooks/use-note-graph";

// react-force-graph touches the DOM/canvas — never SSR it.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// Stable palette for cluster colors; cycles for graphs with many communities.
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

// Node radius grows with connectivity (hubs are bigger) but stays bounded.
function nodeRadius(node: GraphNode): number {
	return 3 + Math.min(9, Math.sqrt(node.degree) * 2.2);
}

type GraphCanvasProps = {
	data: GraphData;
	onOpenNote: (id: string) => void;
};

function GraphCanvas({ data, onOpenNote }: GraphCanvasProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

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

	// react-force-graph mutates the data it receives; clone so the query cache
	// stays immutable and re-renders are stable.
	const graphData = useMemo(
		() => ({
			nodes: data.nodes.map((node) => ({ ...node })),
			links: data.edges.map((edge) => ({ ...edge })),
		}),
		[data],
	);

	const handleNodeClick = useCallback(
		(node: GraphNode) => {
			if (node.type === "note") onOpenNote(node.id);
		},
		[onOpenNote],
	);

	return (
		<div ref={containerRef} className="relative h-full w-full">
			{size.width > 0 && (
				<ForceGraph2D
					width={size.width}
					height={size.height}
					graphData={graphData}
					backgroundColor="transparent"
					nodeRelSize={1}
					nodeVal={(node) => nodeRadius(node as GraphNode) ** 2}
					nodeColor={(node) => nodeColor(node as GraphNode)}
					nodeLabel={(node) => {
						const typed = node as GraphNode;
						return `${typed.label} · ${typed.degree} link${typed.degree === 1 ? "" : "s"}`;
					}}
					linkColor={() => "rgba(148, 163, 184, 0.35)"}
					linkWidth={0.6}
					onNodeClick={(node) => handleNodeClick(node as GraphNode)}
					cooldownTicks={120}
					nodeCanvasObjectMode={() => "after"}
					nodeCanvasObject={(node, ctx, globalScale) => {
						const typed = node as GraphNode & { x?: number; y?: number };
						// Only label hubs and tags once zoomed in enough to read them.
						if (typed.degree < 2 && typed.type !== "tag") return;
						if (globalScale < 1.2) return;
						if (typed.x === undefined || typed.y === undefined) return;
						const fontSize = Math.max(2, 11 / globalScale);
						ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
						ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
						ctx.textAlign = "center";
						ctx.textBaseline = "top";
						ctx.fillText(typed.label, typed.x, typed.y + nodeRadius(typed) + 1);
					}}
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

function GraphEmptyState({ className }: { className?: string }) {
	return (
		<div className={cn("flex h-full flex-col items-center justify-center gap-3 p-8 text-center", className)}>
			<Waypoints className="h-10 w-10 text-muted-foreground" strokeWidth={1.4} />
			<p className="max-w-sm text-sm text-muted-foreground">
				No connections yet. Link notes with <code className="font-mono">[[wiki links]]</code> or
				the <code className="font-mono">@</code> mention, and add <code className="font-mono">#tags</code>{" "}
				— they&apos;ll appear here as your web grows.
			</p>
		</div>
	);
}

export function WorkspaceGraph() {
	const router = useRouter();
	const query = useNoteGraph();

	const openNote = useCallback(
		(id: string) => router.push(`/app?note=${id}`),
		[router],
	);
	const handleOpenSettings = useCallback(() => router.push("/app/settings"), [router]);

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
						<GraphEmptyState />
					) : (
						<>
							<MetricsOverlay data={data!} onOpenNote={openNote} />
							<GraphCanvas data={data!} onOpenNote={openNote} />
						</>
					)}
				</div>
			</div>
		</LayoutContainer>
	);
}
