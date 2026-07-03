import { describe, expect, test } from "bun:test";
import {
	buildTableBlock,
	resolveRichDocument,
	richDocumentKey,
	richDocumentNeedsRepair,
	stripSidebarDragArtifacts,
} from "@/domain/notes/rich-document";
import type { RichTextDocument } from "@/domain/notes/models";

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

describe("richDocumentKey", () => {
	test("is insensitive to JSONB-style key reordering", () => {
		const editorOrder: RichTextDocument = [
			{
				id: "b1",
				type: "paragraph",
				props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
				content: [{ type: "text", text: "hello", styles: {} }],
				children: [],
			},
		];
		const jsonbOrder: RichTextDocument = [
			{
				id: "b1",
				type: "paragraph",
				content: [{ text: "hello", type: "text", styles: {} }],
				props: { textColor: "default", textAlignment: "left", backgroundColor: "default" },
				children: [],
			},
		];

		expect(richDocumentKey(editorOrder)).toBe(richDocumentKey(jsonbOrder));
	});

	test("still distinguishes genuinely different documents", () => {
		const left: RichTextDocument = [
			{
				id: "b1",
				type: "paragraph",
				props: {},
				content: [{ type: "text", text: "hello", styles: {} }],
				children: [],
			},
		];
		const right: RichTextDocument = [
			{
				id: "b1",
				type: "paragraph",
				props: {},
				content: [{ type: "text", text: "hello world", styles: {} }],
				children: [],
			},
		];

		expect(richDocumentKey(left)).not.toBe(richDocumentKey(right));
	});

	test("treats null and undefined as an empty document", () => {
		expect(richDocumentKey(null)).toBe(richDocumentKey(undefined));
		expect(richDocumentKey(null)).toBe(richDocumentKey([]));
	});
});
