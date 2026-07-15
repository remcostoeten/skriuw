import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "./nodes";

const NODE_TYPES = new Set([
	"process",
	"decision",
	"terminal",
	"data",
	"circle",
	"subroutine",
	"cylinder",
	"hexagon",
	"note",
]);
const DIRECTIONS = new Set(["TD", "LR", "RL", "BT"]);

export type GeneratedDiagram = {
	direction: string;
	nodes: Node<NodeData>[];
	edges: Edge[];
};

type GeneratedNode = { id?: unknown; type?: unknown; label?: unknown };
type GeneratedEdge = { source?: unknown; target?: unknown; label?: unknown };

function cleanId(value: unknown, index: number): string {
	const id = typeof value === "string" ? value.trim().replace(/[^a-zA-Z0-9_-]/g, "-") : "";
	return id || `node-${index + 1}`;
}

/** Validates the intentionally small JSON schema returned by the AI. */
export function parseGeneratedDiagram(raw: string): GeneratedDiagram {
	const parsed = JSON.parse(raw) as {
		direction?: unknown;
		nodes?: GeneratedNode[];
		edges?: GeneratedEdge[];
	};
	if (!Array.isArray(parsed.nodes) || parsed.nodes.length < 2) {
		throw new Error("The AI response did not include enough diagram nodes.");
	}

	const direction =
		typeof parsed.direction === "string" && DIRECTIONS.has(parsed.direction)
			? parsed.direction
			: "TD";
	const horizontal = direction === "LR" || direction === "RL";
	const usedIds = new Set<string>();
	const nodes = parsed.nodes.slice(0, 20).map((node, index) => {
		let id = cleanId(node.id, index);
		while (usedIds.has(id)) id = `${id}-${index + 1}`;
		usedIds.add(id);
		const type =
			typeof node.type === "string" && NODE_TYPES.has(node.type) ? node.type : "process";
		const label = typeof node.label === "string" ? node.label.trim().slice(0, 80) : "Step";
		return {
			id,
			type,
			position: horizontal
				? { x: 40 + index * 170, y: 160 }
				: { x: 260, y: 40 + index * 105 },
			data: { label: label || "Step" },
		} satisfies Node<NodeData>;
	});
	const validIds = new Set(nodes.map((node) => node.id));
	const edges = (Array.isArray(parsed.edges) ? parsed.edges : [])
		.slice(0, 30)
		.flatMap((edge, index) => {
			const source = typeof edge.source === "string" ? edge.source.trim() : "";
			const target = typeof edge.target === "string" ? edge.target.trim() : "";
			if (!validIds.has(source) || !validIds.has(target) || source === target) return [];
			return [
				{
					id: `edge-${index + 1}`,
					source,
					target,
					label: typeof edge.label === "string" ? edge.label.slice(0, 40) : undefined,
				},
			];
		});

	if (!edges.length) throw new Error("The AI response did not include valid connections.");
	return { direction, nodes, edges };
}
