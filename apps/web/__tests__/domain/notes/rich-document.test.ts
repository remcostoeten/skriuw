import { describe, expect, test } from "bun:test";
import {
	buildTableBlock,
	cloneRichDocument,
	extractRichDocumentPersonIds,
	flattenInlineChips,
	markdownToRichDocument,
	parseInlineContent,
	resolveRichDocument,
	richDocumentKey,
	richDocumentNeedsRepair,
	richDocumentToSearchableMarkdown,
	stripSidebarDragArtifacts,
	upgradeRichDocumentChips,
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
		expect((resolved[0] as { content?: { type?: string } }).content?.type).toBe("tableContent");
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

describe("parseInlineContent", () => {
	test("parses wiki links, tags, and code spans", () => {
		const result = parseInlineContent("see [[My Note]] and `code` #tag");
		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "noteLink", props: { title: "My Note" } }),
				expect.objectContaining({ type: "tag", props: { name: "tag" } }),
				expect.objectContaining({
					type: "text",
					text: "code",
					styles: expect.objectContaining({ code: true }),
				}),
			]),
		);
	});

	test("parses bold, italic, and strikethrough markers", () => {
		const bold = parseInlineContent("**bold**");
		expect(bold[0]).toEqual(
			expect.objectContaining({ styles: expect.objectContaining({ bold: true }) }),
		);

		const italic = parseInlineContent("*italic*");
		expect(italic[0]).toEqual(
			expect.objectContaining({ styles: expect.objectContaining({ italic: true }) }),
		);

		const strike = parseInlineContent("~~gone~~");
		expect(strike[0]).toEqual(
			expect.objectContaining({ styles: expect.objectContaining({ strike: true }) }),
		);
	});

	test("returns empty array for empty text", () => {
		expect(parseInlineContent("")).toEqual([]);
	});

	test("parses inline markdown links", () => {
		const result = parseInlineContent("[label](https://example.com)");
		expect(result[0]).toEqual(
			expect.objectContaining({
				type: "link",
				href: "https://example.com",
			}),
		);
	});
});

describe("markdownToRichDocument", () => {
	test("parses headings, lists, quotes, and code fences", () => {
		const markdown = [
			"# Title",
			"",
			"- item one",
			"- [x] done task",
			"",
			"> a quote",
			"",
			"```ts",
			"const a = 1;",
			"```",
		].join("\n");

		const blocks = markdownToRichDocument(markdown);
		const types = blocks.map((block) => block.type);

		expect(types).toContain("heading");
		expect(types).toContain("bulletListItem");
		expect(types).toContain("checkListItem");
		expect(types).toContain("quote");
		expect(types).toContain("procode");
	});

	test("parses a markdown table into a BlockNote table block", () => {
		const markdown = "| A | B |\n| --- | --- |\n| 1 | 2 |";
		const blocks = markdownToRichDocument(markdown);
		expect(blocks[0]?.type).toBe("table");
		expect((blocks[0] as { content?: { type?: string } }).content?.type).toBe("tableContent");
	});

	test("unwraps an outer markdown fence emitted by local LLMs", () => {
		const markdown = ["```markdown", "# Real Title", "", "body text", "```"].join("\n");
		const blocks = markdownToRichDocument(markdown);
		expect(blocks[0]?.type).toBe("heading");
	});

	test("falls back to an empty paragraph for blank input", () => {
		const blocks = markdownToRichDocument("");
		expect(blocks).toEqual([{ type: "paragraph", content: "" }]);
	});

	test("parses a mermaid fence into a diagram block", () => {
		const markdown = ["```mermaid", "flowchart TD", "    A --> B", "```"].join("\n");
		const blocks = markdownToRichDocument(markdown);
		expect(blocks[0]?.type).toBe("diagram");
		expect((blocks[0] as { props?: { source?: string } }).props?.source).toBe(
			"flowchart TD\n    A --> B",
		);
	});

	test("parses a horizontal rule as a divider block", () => {
		const blocks = markdownToRichDocument("above\n\n---\n\nbelow");
		expect(blocks.map((block) => block.type)).toContain("divider");
	});
});

describe("flattenInlineChips", () => {
	test("flattens a diagram block to a mermaid procode fence", () => {
		const blocks = [
			{ type: "diagram", props: { source: "flowchart TD\n    A --> B" } },
		] as unknown as RichTextDocument;
		const flattened = flattenInlineChips(blocks);
		expect(flattened[0]?.type).toBe("procode");
		expect((flattened[0] as { props?: { language?: string } }).props?.language).toBe("mermaid");
		expect(flattened[0]?.content).toBe("flowchart TD\n    A --> B");
	});
});

describe("richDocumentToSearchableMarkdown", () => {
	test("renders headings and chips back to markdown-ish text", () => {
		const document: RichTextDocument = [
			{
				id: "b1",
				type: "heading",
				props: { level: 2 },
				content: [{ type: "text", text: "Title", styles: {} }],
				children: [],
			},
			{
				id: "b2",
				type: "bulletListItem",
				props: {},
				content: [{ type: "noteLink", props: { title: "Linked" } }],
				children: [],
			},
		];

		const text = richDocumentToSearchableMarkdown(document);
		expect(text).toContain("## Title");
		expect(text).toContain("[[Linked]]");
	});

	test("returns an empty string for an empty document", () => {
		expect(richDocumentToSearchableMarkdown(null)).toBe("");
		expect(richDocumentToSearchableMarkdown([])).toBe("");
	});
});

describe("extractRichDocumentPersonIds", () => {
	test("collects unique person chip ids from nested children", () => {
		const document: RichTextDocument = [
			{
				id: "b1",
				type: "paragraph",
				props: {},
				content: [],
				children: [
					{
						id: "b2",
						type: "paragraph",
						props: {},
						content: [{ type: "person", props: { id: "p2" } }],
						children: [],
					},
				],
			},
		];

		expect(extractRichDocumentPersonIds(document)).toEqual(["p2"]);
		expect(extractRichDocumentPersonIds(undefined)).toEqual([]);
	});
});

describe("upgradeRichDocumentChips", () => {
	test("re-parses stringified inline content into structured chips", () => {
		const document = [
			{
				id: "b1",
				type: "paragraph",
				props: {},
				content: "hello [[Note]] #tag",
				children: [],
			},
		] as unknown as RichTextDocument;

		const upgraded = upgradeRichDocumentChips(document);
		const content = (upgraded[0] as { content?: unknown[] }).content ?? [];
		expect(content.some((node) => (node as { type?: string }).type === "noteLink")).toBe(true);
		expect(content.some((node) => (node as { type?: string }).type === "tag")).toBe(true);
	});
});

describe("cloneRichDocument", () => {
	test("produces a deep copy that does not share references", () => {
		const original = [
			{
				id: "b1",
				type: "paragraph",
				props: {},
				content: [{ type: "text", text: "hi", styles: {} }],
				children: [],
			},
		] as unknown as RichTextDocument;

		const cloned = cloneRichDocument(original as never);
		expect(cloned).toEqual(original);
		expect(cloned).not.toBe(original);
		expect(cloned[0]).not.toBe(original[0]);
	});
});
