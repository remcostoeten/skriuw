import { describe, expect, test } from "bun:test";
import {
	DEFAULT_FILE_TREE_SOURCE,
	countFileTreeNodes,
	isFileTreeFence,
	parseFileTreeSource,
} from "@/shared/lib/file-tree";
import { markdownToRichDocument, flattenInlineChips } from "@/domain/notes/rich-document";

type BlockWithProps = {
	type?: string;
	props?: Record<string, unknown>;
	content?: unknown;
};

describe("file tree block data", () => {
	test("parses the starter notes tree into nested nodes", () => {
		const parsed = parseFileTreeSource(DEFAULT_FILE_TREE_SOURCE);
		const totals = countFileTreeNodes(parsed.children);

		expect(parsed.rootName).toBe("Skriuw workspace");
		expect(parsed.children.map((node) => [node.name, node.kind])).toEqual([
			["Start here", "folder"],
			["Product launch", "folder"],
			["Reference", "folder"],
		]);
		expect(parsed.children[0]?.children[0]?.name).toBe("Skriuw, at a glance");
		expect(totals).toEqual({ folders: 5, files: 6 });
	});

	test("detects explicit filetree fences and legacy text tree fences", () => {
		expect(isFileTreeFence("filetree", DEFAULT_FILE_TREE_SOURCE)).toBe(true);
		expect(isFileTreeFence("tree", DEFAULT_FILE_TREE_SOURCE)).toBe(true);
		expect(isFileTreeFence("text", DEFAULT_FILE_TREE_SOURCE)).toBe(true);
		expect(isFileTreeFence("text", "hello\nworld")).toBe(false);
	});

	test("round-trips filetree markdown through the rich document shape", () => {
		const document = markdownToRichDocument(
			`\`\`\`filetree\n${DEFAULT_FILE_TREE_SOURCE}\n\`\`\``,
		);
		const firstBlock = document[0] as BlockWithProps | undefined;

		expect(firstBlock?.type).toBe("fileTree");
		expect(firstBlock?.props?.source).toContain("Skriuw workspace");

		const flattened = flattenInlineChips(document);
		const firstFlattenedBlock = flattened[0] as BlockWithProps | undefined;

		expect(firstFlattenedBlock?.type).toBe("procode");
		expect(firstFlattenedBlock?.props?.language).toBe("filetree");
		expect(firstFlattenedBlock?.content).toContain("Start here/");
	});
});
