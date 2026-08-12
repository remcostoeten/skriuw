import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "./nodes";

export type DiagramPreset = {
	id: string;
	label: string;
	description: string;
	direction: string;
	nodes: Node<NodeData>[];
	edges: Edge[];
};

export const DIAGRAM_PRESETS: DiagramPreset[] = [
	{
		id: "approval",
		label: "Approval workflow",
		description: "Review, approve, or return a request.",
		direction: "TD",
		nodes: [
			{
				id: "start",
				type: "terminal",
				position: { x: 250, y: 30 },
				data: { label: "Request" },
			},
			{
				id: "review",
				type: "process",
				position: { x: 250, y: 130 },
				data: { label: "Review" },
			},
			{
				id: "approved",
				type: "decision",
				position: { x: 235, y: 235 },
				data: { label: "Approved?" },
			},
			{
				id: "revise",
				type: "process",
				position: { x: 80, y: 345 },
				data: { label: "Revise request" },
			},
			{
				id: "publish",
				type: "process",
				position: { x: 390, y: 345 },
				data: { label: "Publish" },
			},
			{
				id: "end",
				type: "terminal",
				position: { x: 390, y: 445 },
				data: { label: "Complete" },
			},
		],
		edges: [
			{ id: "start-review", source: "start", target: "review" },
			{ id: "review-approved", source: "review", target: "approved" },
			{ id: "approved-revise", source: "approved", target: "revise", label: "No" },
			{ id: "revise-review", source: "revise", target: "review" },
			{ id: "approved-publish", source: "approved", target: "publish", label: "Yes" },
			{ id: "publish-end", source: "publish", target: "end" },
		],
	},
	{
		id: "release",
		label: "Release pipeline",
		description: "Build, test, deploy, and monitor a release.",
		direction: "LR",
		nodes: [
			{ id: "plan", type: "terminal", position: { x: 30, y: 180 }, data: { label: "Ready" } },
			{
				id: "build",
				type: "process",
				position: { x: 170, y: 180 },
				data: { label: "Build" },
			},
			{
				id: "tests",
				type: "decision",
				position: { x: 320, y: 160 },
				data: { label: "Tests pass?" },
			},
			{
				id: "fix",
				type: "process",
				position: { x: 320, y: 320 },
				data: { label: "Fix issues" },
			},
			{
				id: "deploy",
				type: "process",
				position: { x: 490, y: 180 },
				data: { label: "Deploy" },
			},
			{
				id: "monitor",
				type: "terminal",
				position: { x: 650, y: 180 },
				data: { label: "Monitor" },
			},
		],
		edges: [
			{ id: "plan-build", source: "plan", target: "build" },
			{ id: "build-tests", source: "build", target: "tests" },
			{ id: "tests-fix", source: "tests", target: "fix", label: "No" },
			{ id: "fix-build", source: "fix", target: "build" },
			{ id: "tests-deploy", source: "tests", target: "deploy", label: "Yes" },
			{ id: "deploy-monitor", source: "deploy", target: "monitor" },
		],
	},
];

export function getDiagramPreset(id: string): DiagramPreset | undefined {
	return DIAGRAM_PRESETS.find((preset) => preset.id === id);
}

export function cloneDiagramPreset(preset: DiagramPreset) {
	return {
		direction: preset.direction,
		nodes: preset.nodes.map((node) => ({
			...node,
			position: { ...node.position },
			data: { ...node.data },
		})),
		edges: preset.edges.map((edge) => ({
			...edge,
			data: edge.data ? { ...edge.data } : undefined,
			style: edge.style ? { ...edge.style } : undefined,
		})),
	};
}
