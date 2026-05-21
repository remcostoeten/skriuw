import { describe, expect, test } from "bun:test";
import {
	buildNoteVersionContentHash,
	formatNoteVersionDelta,
	previewVersionContent,
	shouldPersistNoteVersion,
} from "@/domain/notes/versioning";

describe("note versioning", () => {
	test("persists the first checkpoint and skips identical saves", () => {
		const candidate = {
			name: "Alpha.md",
			content: "# Alpha",
			richContent: [],
			preferredEditorMode: "block" as const,
			parentId: null,
			tags: ["draft"],
			reason: "autosave" as const,
			createdAt: new Date("2026-05-21T10:00:00.000Z"),
		};

		expect(shouldPersistNoteVersion(candidate, null)).toBe(true);

		const latest = {
			contentHash: buildNoteVersionContentHash(candidate),
			content: candidate.content,
			name: candidate.name,
			createdAt: new Date("2026-05-21T09:58:00.000Z"),
		};

		expect(shouldPersistNoteVersion(candidate, latest)).toBe(false);
	});

	test("records meaningful autosave changes after enough time or size delta", () => {
		const latest = {
			contentHash: "previous",
			content: "one two three",
			name: "Alpha.md",
			createdAt: new Date("2026-05-21T10:00:00.000Z"),
		};

		expect(
			shouldPersistNoteVersion(
				{
					name: "Alpha.md",
					content: "one two three four five six seven eight nine ten",
					richContent: [],
					preferredEditorMode: "block",
					parentId: null,
					tags: [],
					reason: "autosave",
					createdAt: new Date("2026-05-21T10:06:00.000Z"),
				},
				latest,
			),
		).toBe(true);
	});

	test("formats version metadata for the sidebar", () => {
		expect(formatNoteVersionDelta("one two three four", "one two")).toBe("+2 +11");
		expect(previewVersionContent("# Title\n\nParagraph one\n\nParagraph two")).toEqual([
			"# Title",
			"Paragraph one",
			"Paragraph two",
		]);
	});
});
