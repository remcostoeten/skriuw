import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "./nodes";

export const defaultNodes: Node<NodeData>[] = [
	{ id: "1", type: "terminal", position: { x: 250, y: 50 }, data: { label: "Start" } },
	{
		id: "2",
		type: "process",
		position: { x: 250, y: 150 },
		data: { label: "Authenticate User" },
	},
	{ id: "3", type: "decision", position: { x: 235, y: 250 }, data: { label: "Valid?" } },
	{ id: "4", type: "process", position: { x: 100, y: 360 }, data: { label: "Show Error" } },
	{ id: "5", type: "process", position: { x: 400, y: 360 }, data: { label: "Load Dashboard" } },
	{ id: "6", type: "terminal", position: { x: 250, y: 460 }, data: { label: "End" } },
];

export const defaultEdges: Edge[] = [
	{ id: "e1-2", source: "1", target: "2" },
	{ id: "e2-3", source: "2", target: "3" },
	{ id: "e3-4", source: "3", target: "4", label: "No" },
	{ id: "e3-5", source: "3", target: "5", label: "Yes" },
	{ id: "e4-6", source: "4", target: "6" },
	{ id: "e5-6", source: "5", target: "6" },
];
