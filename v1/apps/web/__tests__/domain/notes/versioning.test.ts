import { describe, expect, test } from "bun:test";
import {
	buildNoteVersionContentHash,
	decideNoteVersionPersistence,
	getVersionContextPreview,
	NOTE_VERSION_COALESCE_WINDOW_MS,
	previewVersionContent,
} from "@/domain/notes/versioning";

function candidateWith(content: string, createdAt: string, reason = "autosave" as const) {
	return {
		name: "Alpha.md",
		content,
		richContent: [],
		preferredEditorMode: "block" as const,
		parentId: null,
		tags: ["draft"],
		reason,
		createdAt: new Date(createdAt),
	};
}

function latestWith(content: string, createdAt: string, reason = "autosave") {
	return {
		id: "v1",
		contentHash: buildNoteVersionContentHash(candidateWith(content, createdAt)),
		content,
		reason,
		createdAt: new Date(createdAt),
	};
}

describe("note versioning", () => {
	test("inserts the first version and skips identical saves", () => {
		const candidate = candidateWith("# Alpha", "2026-05-21T10:00:00.000Z");
		expect(decideNoteVersionPersistence(candidate, null)).toEqual({ action: "insert" });

		const latest = latestWith("# Alpha", "2026-05-21T09:58:00.000Z");
		expect(decideNoteVersionPersistence(candidate, latest)).toEqual({ action: "skip" });
	});

	test("skips whitespace-only and one-or-two-char edits", () => {
		const latest = latestWith("one two three", "2026-05-21T10:00:00.000Z");
		expect(
			decideNoteVersionPersistence(
				candidateWith("one  two three\n", "2026-05-21T11:00:00.000Z"),
				latest,
			),
		).toEqual({ action: "skip" });
		expect(
			decideNoteVersionPersistence(
				candidateWith("one two three!", "2026-05-21T11:00:00.000Z"),
				latest,
			),
		).toEqual({ action: "skip" });
	});

	test("coalesces same-burst meaningful edits into the latest row", () => {
		const latest = latestWith("one two three", "2026-05-21T10:00:00.000Z");
		expect(
			decideNoteVersionPersistence(
				candidateWith("one two three four five six", "2026-05-21T10:00:30.000Z"),
				latest,
			),
		).toEqual({ action: "coalesce", versionId: "v1" });
	});

	test("inserts meaningful edits after the coalesce window", () => {
		const latest = latestWith("one two three", "2026-05-21T10:00:00.000Z");
		const after = new Date(
			new Date("2026-05-21T10:00:00.000Z").getTime() + NOTE_VERSION_COALESCE_WINDOW_MS,
		).toISOString();
		expect(
			decideNoteVersionPersistence(
				candidateWith("one two three four five six", after),
				latest,
			),
		).toEqual({ action: "insert" });
	});

	test("explicit reasons always insert on change and never coalesce", () => {
		const latest = latestWith("one two three", "2026-05-21T10:00:00.000Z", "restore");
		expect(
			decideNoteVersionPersistence(
				candidateWith("one two three four five six", "2026-05-21T10:00:05.000Z"),
				latest,
			),
		).toEqual({ action: "insert" });

		const autosaveLatest = latestWith("one two three", "2026-05-21T10:00:00.000Z");
		expect(
			decideNoteVersionPersistence(
				{
					...candidateWith("one two three four", "2026-05-21T10:00:05.000Z"),
					reason: "rename" as const,
				},
				autosaveLatest,
			),
		).toEqual({ action: "insert" });
	});

	test("formats version metadata for the sidebar", () => {
		expect(previewVersionContent("# Title\n\nParagraph one\n\nParagraph two")).toEqual([
			"# Title",
			"Paragraph one",
			"Paragraph two",
		]);
		expect(getVersionContextPreview("# Title\n\nParagraph one")).toBe("Title");
		expect(getVersionContextPreview("")).toBe(null);
	});
});
