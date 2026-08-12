import { describe, expect, test } from "bun:test";
import { insertMarkdownBelowHeading } from "@/features/editor/lib/ai-tag-insertion";

describe("insertMarkdownBelowHeading", () => {
	test("inserts after the first heading when one exists", () => {
		const heading = { id: "heading-1", type: "heading" as const };
		const firstParagraph = { id: "paragraph-1", type: "paragraph" as const };
		const trailingParagraph = { id: "paragraph-2", type: "paragraph" as const };
		const calls: Array<{ referenceId: string; position: "before" | "after" }> = [];

		const editor = {
			document: [firstParagraph, heading, trailingParagraph],
			insertBlocks: (
				_blocks: unknown[],
				reference: { id: string },
				position: "before" | "after",
			) => {
				calls.push({ referenceId: reference.id, position });
				return [{ id: "inserted-1" }, { id: "inserted-2" }];
			},
		};

		const insertedIds = insertMarkdownBelowHeading(editor, "Tags: #alpha #beta");

		expect(calls).toEqual([{ referenceId: "heading-1", position: "after" }]);
		expect(insertedIds).toEqual(["inserted-1", "inserted-2"]);
	});

	test("falls back to the last block when no heading exists", () => {
		const firstParagraph = { id: "paragraph-1", type: "paragraph" as const };
		const secondParagraph = { id: "paragraph-2", type: "paragraph" as const };
		const calls: Array<{ referenceId: string; position: "before" | "after" }> = [];

		const editor = {
			document: [firstParagraph, secondParagraph],
			insertBlocks: (
				_blocks: unknown[],
				reference: { id: string },
				position: "before" | "after",
			) => {
				calls.push({ referenceId: reference.id, position });
				return [{ id: "inserted-1" }];
			},
		};

		const insertedIds = insertMarkdownBelowHeading(editor, "Tags: #alpha");

		expect(calls).toEqual([{ referenceId: "paragraph-2", position: "after" }]);
		expect(insertedIds).toEqual(["inserted-1"]);
	});
});
