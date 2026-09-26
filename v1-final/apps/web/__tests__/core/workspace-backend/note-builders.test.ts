import { describe, expect, test } from "bun:test";
import { applyNoteUpdate } from "@/core/workspace-backend/note-builders";
import { nameTracksHeading } from "@/domain/notes/note-links";
import type { NoteFile } from "@/domain/notes/models";

function makeNote(overrides: Partial<NoteFile> = {}): NoteFile {
	const now = new Date("2026-01-01T00:00:00Z");
	return {
		id: "n1",
		name: "Untitled.md",
		content: "",
		richContent: { blocks: [] } as unknown as NoteFile["richContent"],
		preferredEditorMode: "block",
		createdAt: now,
		modifiedAt: now,
		parentId: null,
		sortOrder: 0,
		tags: [],
		...overrides,
	};
}

describe("nameTracksHeading", () => {
	test("an Untitled note always tracks the heading", () => {
		expect(nameTracksHeading("Untitled.md", "")).toBe(true);
		expect(nameTracksHeading("Untitled 2.md", "# Anything")).toBe(true);
	});

	test("a name equal to its current heading is still tracking", () => {
		expect(nameTracksHeading("Groceries.md", "# Groceries\n\nmilk")).toBe(true);
	});

	test("a manually diverged name does not track", () => {
		expect(nameTracksHeading("My Custom Name.md", "# Groceries")).toBe(false);
	});

	test("no heading and a real name does not track", () => {
		expect(nameTracksHeading("Groceries.md", "just body text")).toBe(false);
	});
});

describe("applyNoteUpdate heading rename", () => {
	test("names a fresh Untitled note from its first heading", () => {
		const note = makeNote({ name: "Untitled.md", content: "" });
		const next = applyNoteUpdate(note, { id: "n1", content: "# Shopping list" });
		expect(next.name).toBe("Shopping list.md");
	});

	test("keeps following the heading after the first rename", () => {
		const note = makeNote({ name: "Shopping list.md", content: "# Shopping list" });
		const next = applyNoteUpdate(note, { id: "n1", content: "# Weekly groceries" });
		expect(next.name).toBe("Weekly groceries.md");
	});

	test("never clobbers a manually renamed note", () => {
		const note = makeNote({ name: "Keep this name.md", content: "# Original heading" });
		const next = applyNoteUpdate(note, { id: "n1", content: "# Changed heading" });
		expect(next.name).toBe("Keep this name.md");
	});

	test("an explicit name in the input wins over the heading", () => {
		const note = makeNote({ name: "Shopping list.md", content: "# Shopping list" });
		const next = applyNoteUpdate(note, {
			id: "n1",
			name: "Chosen",
			content: "# Some heading",
		});
		expect(next.name).toBe("Chosen.md");
	});

	test("dropping the heading keeps the last derived name (no revert to Untitled)", () => {
		const note = makeNote({ name: "Shopping list.md", content: "# Shopping list" });
		const next = applyNoteUpdate(note, { id: "n1", content: "no heading anymore" });
		expect(next.name).toBe("Shopping list.md");
	});
});
