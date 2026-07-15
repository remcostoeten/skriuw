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

	test("parses bare $name mentions into id-less person chips", () => {
		const result = parseInlineContent("in de ban van $Eline. En $daphne ook.");
		expect(result).toEqual([
			expect.objectContaining({ type: "text", text: "in de ban van " }),
			expect.objectContaining({ type: "person", props: { id: "", name: "Eline" } }),
			expect.objectContaining({ type: "text", text: ". En " }),
			expect.objectContaining({ type: "person", props: { id: "", name: "daphne" } }),
			expect.objectContaining({ type: "text", text: " ook." }),
		]);
	});

	test("does not treat mid-word or numeric dollars as person mentions", () => {
		const price = parseInlineContent("kost $100 euro");
		expect(price.some((node) => node.type === "person")).toBe(false);

		const glued = parseInlineContent("woord$naam blijft tekst");
		expect(glued.some((node) => node.type === "person")).toBe(false);
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
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({ type: "paragraph", content: "" });
	});

	test("assigns a unique id to every parsed block", () => {
		const markdown = ["# Heading", "", "A paragraph.", "", "- a bullet"].join("\n");
		const blocks = markdownToRichDocument(markdown);
		expect(blocks.length).toBeGreaterThan(0);
		for (const block of blocks) {
			expect(typeof block.id).toBe("string");
			expect(block.id).toBeTruthy();
		}
		const ids = blocks.map((block) => block.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("is deterministic: same markdown yields byte-identical richContent", () => {
		const markdown = ["# Heading", "", "A paragraph.", "", "- [ ] a task"].join("\n");
		expect(JSON.stringify(markdownToRichDocument(markdown))).toBe(
			JSON.stringify(markdownToRichDocument(markdown)),
		);
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

	test("flattens a mark chip to portable markdown metadata", () => {
		const flattened = flattenInlineChips([
			{
				type: "paragraph",
				props: {},
				content: [
					{ type: "text", text: "Budget: ", styles: {} },
					{
						type: "mark",
						props: {
							id: "mark_budget",
							kind: "amount",
							text: "€1,250",
							value: "€1,250",
						},
					},
				],
				children: [],
			},
		] as unknown as RichTextDocument);

		const content = (flattened[0] as { content?: Array<{ text?: string }> }).content ?? [];
		expect(content.map((node) => node.text).join("")).toBe(
			"Budget: [€1,250](mark://amount/mark_budget/%E2%82%AC1%2C250/yellow)",
		);
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

describe("person mention markdown round-trip", () => {
	const personDocument = [
		{
			id: "b1",
			type: "paragraph",
			props: {},
			content: [
				{ type: "text", text: "Met ", styles: {} },
				{ type: "person", props: { id: "p1", name: "Alex" } },
				{ type: "text", text: " today", styles: {} },
			],
			children: [],
		},
	] as unknown as RichTextDocument;

	test("flattenInlineChips serializes a person chip as $[Name](person://id)", () => {
		const flattened = flattenInlineChips(personDocument);
		const content = (flattened[0] as { content?: Array<{ text?: string }> }).content ?? [];
		expect(content.map((node) => node.text).join("")).toBe("Met $[Alex](person://p1) today");
	});

	test("richDocumentToSearchableMarkdown keeps the person id", () => {
		expect(richDocumentToSearchableMarkdown(personDocument)).toContain("$[Alex](person://p1)");
	});

	test("markdownToRichDocument parses $[Name](person://id) back into a person chip", () => {
		const document = markdownToRichDocument("Met $[Alex](person://p1) today");
		const content = (document[0] as { content?: unknown[] }).content ?? [];
		const person = content.find((node) => (node as { type?: string }).type === "person") as
			| { props?: { id?: string; name?: string } }
			| undefined;
		expect(person?.props?.id).toBe("p1");
		expect(person?.props?.name).toBe("Alex");
		expect(content.some((node) => (node as { type?: string }).type === "link")).toBe(false);
	});

	test("a person chip without an id degrades to plain $Name text", () => {
		const noIdDocument = [
			{
				id: "b1",
				type: "paragraph",
				props: {},
				content: [{ type: "person", props: { id: "", name: "Alex" } }],
				children: [],
			},
		] as unknown as RichTextDocument;
		const flattened = flattenInlineChips(noIdDocument);
		const content = (flattened[0] as { content?: Array<{ text?: string }> }).content ?? [];
		expect(content.map((node) => node.text).join("")).toBe("$Alex");
	});
});

describe("mark markdown round-trip", () => {
	test("keeps mark text and metadata searchable and reparses it as a mark", () => {
		const document = [
			{
				id: "b1",
				type: "paragraph",
				props: {},
				content: [
					{
						type: "mark",
						props: {
							id: "mark_launch",
							kind: "moment",
							text: "18 September",
							value: "2026-09-18",
							color: "blue",
							label: "Launch date",
						},
					},
				],
				children: [],
			},
		] as unknown as RichTextDocument;

		const markdown = richDocumentToSearchableMarkdown(document);
		expect(markdown).toBe(
			"[18 September](mark://moment/mark_launch/2026-09-18/blue/Launch%20date)",
		);

		const reparsed = markdownToRichDocument(markdown);
		const content = (reparsed[0] as { content?: unknown[] }).content ?? [];
		expect(content).toContainEqual(
			expect.objectContaining({
				type: "mark",
				props: expect.objectContaining({
					id: "mark_launch",
					kind: "moment",
					text: "18 September",
					value: "2026-09-18",
					color: "blue",
					label: "Launch date",
				}),
			}),
		);
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

	test("preserves boundary whitespace on text nodes next to chips", () => {
		const document = [
			{
				id: "b1",
				type: "paragraph",
				props: {},
				content: [
					{ type: "text", text: "tijdens de ", styles: {} },
					{ type: "tag", props: { name: "date" } },
					{ type: "text", text: " dat er niks", styles: {} },
				],
				children: [],
			},
		] as unknown as RichTextDocument;

		const upgraded = upgradeRichDocumentChips(document);
		const content = ((upgraded[0] as { content?: unknown[] }).content ?? []) as Array<{
			type: string;
			text?: string;
		}>;
		expect(content[0]).toEqual(expect.objectContaining({ type: "text", text: "tijdens de " }));
		expect(content[2]).toEqual(expect.objectContaining({ type: "text", text: " dat er niks" }));
	});

	test("preserves boundary whitespace on text nodes next to styled runs", () => {
		const document = [
			{
				id: "b1",
				type: "paragraph",
				props: {},
				content: [
					{ type: "text", text: "Ik moet wel. ", styles: {} },
					{ type: "text", text: "Inshallah", styles: { italic: true } },
					{ type: "text", text: ".", styles: {} },
				],
				children: [],
			},
		] as unknown as RichTextDocument;

		const upgraded = upgradeRichDocumentChips(document);
		const content = ((upgraded[0] as { content?: unknown[] }).content ?? []) as Array<{
			type: string;
			text?: string;
		}>;
		expect(content.map((node) => node.text)).toEqual(["Ik moet wel. ", "Inshallah", "."]);
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

describe("drawing block markdown round-trip", () => {
	const scene = JSON.stringify({
		type: "excalidraw",
		version: 2,
		elements: [{ id: "el1", type: "rectangle", isDeleted: false }],
		appState: {},
		files: {},
	});

	test("excalidraw fence parses into a drawing block", () => {
		const markdown = "before\n\n```excalidraw\n" + scene + "\n```\n\nafter";
		const blocks = markdownToRichDocument(markdown);
		const drawing = blocks.find((block) => String(block.type) === "drawing") as
			| { props?: { scene?: string } }
			| undefined;

		expect(drawing).toBeDefined();
		const parsed = JSON.parse(drawing?.props?.scene ?? "{}");
		expect(parsed.elements).toHaveLength(1);
		expect(parsed.elements[0].id).toBe("el1");
	});

	test("drawing block flattens to an excalidraw fence source", () => {
		const flattened = flattenInlineChips([
			// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			{ type: "drawing", props: { scene } } as any,
		]);

		expect(flattened[0]?.type).toBe("procode");
		expect((flattened[0] as { props?: { language?: string } }).props?.language).toBe(
			"excalidraw",
		);
		expect(flattened[0]?.content).toBe(scene);
	});

	test("scene survives a full flatten → markdown-parse cycle", () => {
		const flattened = flattenInlineChips([
			// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			{ type: "drawing", props: { scene } } as any,
		]);
		const markdown = "```excalidraw\n" + String(flattened[0]?.content ?? "") + "\n```";
		const blocks = markdownToRichDocument(markdown);
		const drawing = blocks[0] as { type?: string; props?: { scene?: string } };

		expect(drawing.type).toBe("drawing");
		expect(JSON.parse(drawing.props?.scene ?? "{}").elements[0].id).toBe("el1");
	});

	test("malformed scene falls back to an empty drawing", () => {
		const blocks = markdownToRichDocument("```excalidraw\nnot json\n```");
		const drawing = blocks[0] as { type?: string; props?: { scene?: string } };

		expect(drawing.type).toBe("drawing");
		expect(drawing.props?.scene).toBe("");
	});
});
