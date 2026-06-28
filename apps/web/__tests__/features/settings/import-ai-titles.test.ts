import { describe, expect, test } from "bun:test";
import {
	applyImportTitleSuggestion,
	createImportTitleSuggestions,
	isImportTitleCandidate,
} from "@/features/settings/lib/import-ai-titles";
import type { NoteFile } from "@/domain/notes/models";

function note(overrides: Partial<NoteFile> = {}): NoteFile {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		name: overrides.name ?? "Imported note.md",
		content:
			overrides.content ??
			"First paragraph with enough words to pass the minimum length gate for AI title generation.\n\nSecond paragraph gives the model context.",
		richContent: overrides.richContent ?? [],
		preferredEditorMode: overrides.preferredEditorMode ?? "raw",
		createdAt: overrides.createdAt ?? new Date("2024-01-01T00:00:00.000Z"),
		modifiedAt: overrides.modifiedAt ?? new Date("2024-01-01T00:00:00.000Z"),
		parentId: overrides.parentId ?? null,
		sortOrder: overrides.sortOrder ?? 0,
		tags: overrides.tags ?? [],
	};
}

describe("import AI title suggestions", () => {
	test("only targets long multi-paragraph notes without an H1", () => {
		expect(isImportTitleCandidate(note())).toBe(true);
		expect(isImportTitleCandidate(note({ content: "Short\n\nBody" }))).toBe(false);
		expect(
			isImportTitleCandidate(
				note({
					content:
						"One paragraph with enough text to pass the character threshold but no blank paragraph break between ideas.",
				}),
			),
		).toBe(false);
		expect(
			isImportTitleCandidate(
				note({
					content:
						"# Existing title\n\nThis imported note already has a heading, so AI should not prepend another title.",
				}),
			),
		).toBe(false);
	});

	test("generates sanitized title suggestions with bounded concurrency and progress", async () => {
		const notes = [note({ id: "a" }), note({ id: "b" }), note({ id: "c", content: "short" })];
		const progress: Array<{ completed: number; succeeded: number; failed: number; active: number }> = [];
		let active = 0;
		let maxActive = 0;

		const result = await createImportTitleSuggestions(notes, {
			concurrency: 2,
			generateTitle: async (content) => {
				active++;
				maxActive = Math.max(maxActive, active);
				await Promise.resolve();
				active--;
				return content.includes("Second paragraph")
					? '"Generated Import Title"'
					: "ignored";
			},
			onProgress: (next) => progress.push(next),
		});

		expect(maxActive).toBeLessThanOrEqual(2);
		expect(result.eligible).toBe(2);
		expect(result.succeeded).toBe(2);
		expect(result.failed).toBe(0);
		expect(result.suggestions.map((suggestion) => suggestion.title)).toEqual([
			"Generated Import Title",
			"Generated Import Title",
		]);
		expect(progress.at(-1)).toMatchObject({ completed: 2, succeeded: 2, failed: 0, active: 0 });
	});

	test("applies a selected title by prepending an H1 and deriving the note name", () => {
		const original = note({ name: "Imported note.md", content: "Paragraph one.\n\nParagraph two." });

		const updated = applyImportTitleSuggestion(original, "Generated Import Title");

		expect(updated.content).toBe("# Generated Import Title\n\nParagraph one.\n\nParagraph two.");
		expect(updated.name).toBe("Generated Import Title.md");
		expect(updated.richContent.length).toBeGreaterThan(0);
	});
});
