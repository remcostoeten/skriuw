import type { Edge, Node } from "@xyflow/react";
import { defaultEdges, defaultNodes } from "./default-diagram";
import { generateMermaid } from "./mermaid-utils";
import type { NodeData } from "./nodes";

export type DiagramGraph = {
	nodes: Node<NodeData>[];
	edges: Edge[];
	direction: string;
};

export function serializeGraph(graph: DiagramGraph): string {
	return JSON.stringify({
		nodes: graph.nodes,
		edges: graph.edges,
		direction: graph.direction,
	});
}

export function parseGraph(raw: string | undefined): DiagramGraph | null {
	if (!raw?.trim()) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<DiagramGraph>;
		if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
			return null;
		}
		return {
			nodes: parsed.nodes as Node<NodeData>[],
			edges: parsed.edges as Edge[],
			direction: typeof parsed.direction === "string" ? parsed.direction : "TD",
		};
	} catch {
		return null;
	}
}

export const DEFAULT_DIAGRAM_GRAPH: DiagramGraph = {
	nodes: defaultNodes,
	edges: defaultEdges,
	direction: "TD",
};

export function defaultGraphSource(): string {
	return generateMermaid(defaultNodes, defaultEdges, "TD");
}
