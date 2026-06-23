import { describe, expect, test } from "bun:test";
import {
	buildTableBlock,
	resolveRichDocument,
	richDocumentNeedsRepair,
	stripSidebarDragArtifacts,
} from "@/domain/notes/rich-document";

describe("resolveRichDocument", () => {
	test("repairs legacy seed table blocks from markdown", () => {
		const legacyTable = [
			{
				id: "t1",
				type: "table",
				props: {},
				content: [
					{ type: "text", text: "| Step | Do this |", styles: {} },
					{ type: "text", text: "| --- | --- |", styles: {} },
					{ type: "text", text: "| Capture | Write it down |", styles: {} },
				],
				children: [],
			},
		];

		expect(richDocumentNeedsRepair(legacyTable)).toBe(true);

		const markdown = "| Step | Do this |\n| --- | --- |\n| Capture | Write it down |";
		const resolved = resolveRichDocument(markdown, legacyTable);
		expect(resolved[0]?.type).toBe("table");
		expect((resolved[0] as { content?: { type?: string } }).content?.type).toBe(
			"tableContent",
		);
	});

	test("buildTableBlock produces BlockNote table content", () => {
		const block = buildTableBlock(["A", "B"], [["1", "2"]]);
		expect(block.type).toBe("table");
		expect((block as { content?: { type?: string } }).content?.type).toBe("tableContent");
	});
});

describe("stripSidebarDragArtifacts", () => {
	test("removes sidebar drag JSON prefixes from text", () => {
		const input =
			'{"type":"file","id":"c71c3913-bf8f-46b6-9e98-36672288fe0b","parentId":null}Folders — organize notes in the sidebar';

		expect(stripSidebarDragArtifacts(input)).toBe("Folders — organize notes in the sidebar");
	});

	test("removes multiple drag artifacts", () => {
		const input =
			'{"type":"file","id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","parentId":null}One {"type":"folder","id":"bbbbbbbb-cccc-dddd-eeee-ffffffffffff","parentId":null}Two';

		expect(stripSidebarDragArtifacts(input)).toBe("One Two");
	});
});
