import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "./nodes";

export function generateMermaid(
	nodes: Node<NodeData>[],
	edges: Edge[],
	direction: string = "TD",
): string {
	let code = `flowchart ${direction}\n`;

	nodes.forEach((node) => {
		const label = (node.data?.label || node.id).replace(/"/g, "'");

		let shape = "";
		switch (node.type) {
			case "decision":
				shape = `${node.id}{"${label}"}`;
				break;
			case "terminal":
				shape = `${node.id}(["${label}"])`;
				break;
			case "data":
				shape = `${node.id}[/"${label}"/]`;
				break;
			case "cylinder":
				shape = `${node.id}[("${label}")]`;
				break;
			case "hexagon":
				shape = `${node.id}{{"${label}"}}`;
				break;
			case "circle":
				shape = `${node.id}(("${label}"))`;
				break;
			case "subroutine":
				shape = `${node.id}[["${label}"]]`;
				break;
			case "note":
				shape = `${node.id}>"${label}"]`;
				break;
			default:
				shape = `${node.id}["${label}"]`;
				break;
		}

		code += `  ${shape}\n`;

		const styleParts: string[] = [];
		if (node.data?.fillColor) styleParts.push(`fill:${node.data.fillColor}`);
		if (node.data?.accent) styleParts.push(`stroke:${node.data.accent},stroke-width:2px`);
		if (node.data?.borderStyle === "dashed") styleParts.push("stroke-dasharray:6 3");
		if (styleParts.length) code += `  style ${node.id} ${styleParts.join(",")}\n`;
	});

	edges.forEach((edge) => {
		const lbl = edge.label ? `|"${edge.label}"|` : "";
		const dashed = edge.data?.dashed;
		const arrow = dashed ? `-.->` : `-->`;
		code += `  ${edge.source} ${arrow}${lbl} ${edge.target}\n`;
	});

	return code;
}
