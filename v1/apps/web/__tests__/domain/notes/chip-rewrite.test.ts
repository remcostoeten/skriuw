import { describe, expect, test } from "bun:test";
import {
	rewriteMarkdownTags,
	rewriteNoteForPerson,
	rewriteNoteForTag,
} from "@/domain/notes/chip-rewrite";
import type { RichTextDocument } from "@/domain/notes/models";

function tagChip(name: string) {
	return { type: "tag", props: { name } };
}

function personChip(id: string, name: string) {
	return { type: "person", props: { id, name } };
}

function paragraph(content: unknown[]) {
	return { id: "block-1", type: "paragraph", props: {}, content, children: [] };
}

describe("rewriteMarkdownTags", () => {
	test("renames tags outside code and leaves code intact", () => {
		const result = rewriteMarkdownTags(
			"Notes on #idea and `#idea` plus\n```\n#idea in code\n```\n(#idea)",
			"idea",
			"concept",
		);

		expect(result.changed).toBe(true);
		expect(result.content).toBe(
			"Notes on #concept and `#idea` plus\n```\n#idea in code\n```\n(#concept)",
		);
	});

	test("delete drops the hash but keeps the word", () => {
		const result = rewriteMarkdownTags("Working on #idea today", "idea", null);
		expect(result.content).toBe("Working on idea today");
	});

	test("does not touch other tags or partial matches", () => {
		const result = rewriteMarkdownTags("#ideas #idea-two #idea", "idea", "concept");
		expect(result.content).toBe("#ideas #idea-two #concept");
	});

	test("matches case-insensitively like the extractor", () => {
		const result = rewriteMarkdownTags("Tagged #Idea", "idea", "concept");
		expect(result.content).toBe("Tagged #concept");
	});
});

describe("rewriteNoteForTag", () => {
	test("rewrites chips, markdown, and tags[] in one patch", () => {
		const richContent = [
			paragraph([{ type: "text", text: "About ", styles: {} }, tagChip("idea")]),
		] as RichTextDocument;

		const patch = rewriteNoteForTag(
			{ content: "About #idea", richContent, tags: ["idea", "other"] },
			"idea",
			"concept",
		);

		expect(patch).not.toBeNull();
		expect(patch?.content).toBe("About #concept");
		expect(patch?.tags).toEqual(["concept", "other"]);
		const inline = (patch!.richContent![0] as { content: Array<{ props?: { name?: string } }> })
			.content;
		expect(inline[1]?.props?.name).toBe("concept");
	});

	test("merge into an existing tag dedupes tags[]", () => {
		const patch = rewriteNoteForTag(
			{ content: "", richContent: [], tags: ["idea", "concept"] },
			"idea",
			"concept",
		);

		expect(patch?.tags).toEqual(["concept"]);
	});

	test("delete replaces the chip with plain text", () => {
		const richContent = [paragraph([tagChip("idea")])] as RichTextDocument;
		const patch = rewriteNoteForTag({ content: "", richContent, tags: [] }, "idea", null);

		const inline = (patch!.richContent![0] as { content: Array<Record<string, unknown>> })
			.content;
		expect(inline).toEqual([{ type: "text", text: "idea", styles: {} }]);
	});

	test("returns null when nothing matches", () => {
		const patch = rewriteNoteForTag(
			{ content: "No tags here", richContent: [], tags: ["other"] },
			"idea",
			"concept",
		);
		expect(patch).toBeNull();
	});

	test("rewrites chips nested in block children", () => {
		const richContent = [
			{
				id: "outer",
				type: "bulletListItem",
				props: {},
				content: [{ type: "text", text: "item", styles: {} }],
				children: [paragraph([tagChip("idea")])],
			},
		] as RichTextDocument;

		const patch = rewriteNoteForTag({ content: "", richContent, tags: [] }, "idea", "concept");
		const child = (
			patch!.richContent![0] as {
				children: Array<{ content: Array<{ props?: { name?: string } }> }>;
			}
		).children[0];
		expect(child.content[0]?.props?.name).toBe("concept");
	});
});

describe("rewriteNoteForPerson", () => {
	test("merge repoints the chip id and refreshes the cached name", () => {
		const richContent = [paragraph([personChip("p1", "Old Name")])] as RichTextDocument;
		const patch = rewriteNoteForPerson(
			{ richContent },
			{ fromId: "p1", toId: "p2", toName: "New Name" },
		);

		const inline = (
			patch!.richContent![0] as {
				content: Array<{ props?: { id?: string; name?: string } }>;
			}
		).content;
		expect(inline[0]?.props?.id).toBe("p2");
		expect(inline[0]?.props?.name).toBe("New Name");
	});

	test("delete replaces the chip with the person's name as text", () => {
		const richContent = [paragraph([personChip("p1", "Ada")])] as RichTextDocument;
		const patch = rewriteNoteForPerson(
			{ richContent },
			{ fromId: "p1", toId: null, removalText: "Ada Lovelace" },
		);

		const inline = (patch!.richContent![0] as { content: Array<Record<string, unknown>> })
			.content;
		expect(inline).toEqual([{ type: "text", text: "Ada Lovelace", styles: {} }]);
	});

	test("returns null when the person is not mentioned", () => {
		const richContent = [paragraph([personChip("p1", "Ada")])] as RichTextDocument;
		expect(rewriteNoteForPerson({ richContent }, { fromId: "p9", toId: null })).toBeNull();
	});
});
