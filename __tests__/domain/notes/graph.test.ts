import { describe, expect, test } from "bun:test";
import {
	buildGraphData,
	computeDegree,
	detectCommunities,
	type GraphEdge,
	type GraphNode,
	type NoteLinkRow,
} from "@/domain/notes/graph";

function note(id: string, name: string) {
	return { id, name };
}

describe("buildGraphData", () => {
	test("resolves wiki links by normalized title and skips ambiguous targets", () => {
		const notes = [note("a", "Alpha"), note("b", "Beta.md")];
		const links: NoteLinkRow[] = [
			{ sourceNoteId: "a", targetNoteId: null, targetLabel: "Beta", kind: "wiki" },
			// Unresolvable — no note titled "Ghost".
			{ sourceNoteId: "a", targetNoteId: null, targetLabel: "Ghost", kind: "wiki" },
		];

		const graph = buildGraphData(notes, links);

		expect(graph.edges).toHaveLength(1);
		expect(graph.edges[0]).toMatchObject({ source: "a", target: "b", kind: "note" });
		expect(graph.metrics.noteCount).toBe(2);
	});

	test("honors explicit markdown link target ids", () => {
		const notes = [note("a", "Alpha"), note("b", "Beta")];
		const links: NoteLinkRow[] = [
			{ sourceNoteId: "a", targetNoteId: "b", targetLabel: "Beta", kind: "markdown-note-link" },
		];

		const graph = buildGraphData(notes, links);
		expect(graph.edges).toHaveLength(1);
		expect(graph.edges[0].target).toBe("b");
	});

	test("creates tag nodes and links notes that share a tag", () => {
		const notes = [note("a", "Alpha"), note("b", "Beta")];
		const links: NoteLinkRow[] = [
			{ sourceNoteId: "a", targetNoteId: null, targetLabel: "idea", kind: "tag" },
			{ sourceNoteId: "b", targetNoteId: null, targetLabel: "idea", kind: "tag" },
		];

		const graph = buildGraphData(notes, links);
		const tagNode = graph.nodes.find((n) => n.type === "tag");

		expect(tagNode).toBeDefined();
		expect(tagNode?.label).toBe("#idea");
		expect(graph.metrics.tagCount).toBe(1);
		// Both notes connect to the single tag node.
		expect(graph.edges).toHaveLength(2);
		expect(tagNode?.degree).toBe(2);
	});

	test("flags unlinked notes as orphans and ranks hubs by degree", () => {
		const notes = [note("hub", "Hub"), note("a", "A"), note("b", "B"), note("lonely", "Lonely")];
		const links: NoteLinkRow[] = [
			{ sourceNoteId: "a", targetNoteId: "hub", targetLabel: "Hub", kind: "markdown-note-link" },
			{ sourceNoteId: "b", targetNoteId: "hub", targetLabel: "Hub", kind: "markdown-note-link" },
		];

		const graph = buildGraphData(notes, links);

		expect(graph.metrics.orphans.map((o) => o.id)).toContain("lonely");
		expect(graph.metrics.orphanCount).toBe(1);
		expect(graph.metrics.topHubs[0]).toMatchObject({ id: "hub", degree: 2 });
	});

	test("dedupes reciprocal links into one undirected edge", () => {
		const notes = [note("a", "Alpha"), note("b", "Beta")];
		const links: NoteLinkRow[] = [
			{ sourceNoteId: "a", targetNoteId: "b", targetLabel: "Beta", kind: "wiki" },
			{ sourceNoteId: "b", targetNoteId: "a", targetLabel: "Alpha", kind: "wiki" },
		];

		const graph = buildGraphData(notes, links);
		expect(graph.edges).toHaveLength(1);
	});
});

describe("computeDegree", () => {
	test("counts undirected degree per node", () => {
		const nodes: GraphNode[] = [
			{ id: "a", label: "A", type: "note", degree: 0, cluster: 0 },
			{ id: "b", label: "B", type: "note", degree: 0, cluster: 0 },
			{ id: "c", label: "C", type: "note", degree: 0, cluster: 0 },
		];
		const edges: GraphEdge[] = [
			{ source: "a", target: "b", kind: "note" },
			{ source: "a", target: "c", kind: "note" },
		];

		computeDegree(nodes, edges);
		expect(nodes.find((n) => n.id === "a")?.degree).toBe(2);
		expect(nodes.find((n) => n.id === "b")?.degree).toBe(1);
	});
});

describe("detectCommunities", () => {
	test("separates two disconnected groups into different clusters", () => {
		// Group 1: a-b-c triangle. Group 2: x-y-z triangle. No edge between them.
		const nodes: GraphNode[] = ["a", "b", "c", "x", "y", "z"].map((id) => ({
			id,
			label: id,
			type: "note" as const,
			degree: 0,
			cluster: 0,
		}));
		const edges: GraphEdge[] = [
			{ source: "a", target: "b", kind: "note" },
			{ source: "b", target: "c", kind: "note" },
			{ source: "c", target: "a", kind: "note" },
			{ source: "x", target: "y", kind: "note" },
			{ source: "y", target: "z", kind: "note" },
			{ source: "z", target: "x", kind: "note" },
		];

		detectCommunities(nodes, edges);

		const clusterOf = (id: string) => nodes.find((n) => n.id === id)?.cluster;
		expect(clusterOf("a")).toBe(clusterOf("b"));
		expect(clusterOf("a")).toBe(clusterOf("c"));
		expect(clusterOf("x")).toBe(clusterOf("y"));
		expect(clusterOf("a")).not.toBe(clusterOf("x"));
	});
});
