import { describe, expect, test } from "bun:test";
import { generateNoteContent } from "@/features/notes/lib/generate-note-content";

describe("generateNoteContent", () => {
	test("creates a calm note without tutorial copy or automatic tags", () => {
		const content = generateNoteContent("Trip.md");
		expect(content).toBe("# Trip\n\n");
		expect(content).not.toContain("#draft");
		expect(content).not.toContain("Start writing here");
	});
});
