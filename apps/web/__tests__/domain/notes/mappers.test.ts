import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { describe, expect, test } from "bun:test";
import {
	fromPersistedNote,
	fromPersistedNoteVersion,
	toPersistedNote,
} from "@/domain/notes/mappers";

describe("note mappers", () => {
	test("maps note files to persisted notes", () => {
		const file = {
			id: "note-1",
			name: "Test.md",
			content: "# Test",
			richContent: markdownToRichDocument("# Test"),
			preferredEditorMode: "block" as const,
			parentId: "folder-1",
			createdAt: new Date("2026-03-01T10:00:00.000Z"),
			modifiedAt: new Date("2026-03-02T12:00:00.000Z"),
		};

		expect(toPersistedNote(file)).toEqual({
			id: "note-1",
			name: "Test.md",
			content: "# Test",
			richContent: markdownToRichDocument("# Test"),
			preferredEditorMode: "block",
			parentId: "folder-1",
			createdAt: "2026-03-01T10:00:00.000Z",
			updatedAt: "2026-03-02T12:00:00.000Z",
			journalMeta: undefined,
		});
	});

	test("maps persisted notes back to note files", () => {
		const note = fromPersistedNote({
			id: "note-1" as never,
			name: "Test.md",
			content: "# Test" as never,
			richContent: markdownToRichDocument("# Test"),
			preferredEditorMode: "block",
			parentId: "folder-1" as never,
			createdAt: "2026-03-01T10:00:00.000Z" as never,
			updatedAt: "2026-03-02T12:00:00.000Z" as never,
		});

		expect(note.createdAt).toBeInstanceOf(Date);
		expect(note.modifiedAt).toBeInstanceOf(Date);
		expect(note.modifiedAt.toISOString()).toBe("2026-03-02T12:00:00.000Z");
		expect(note.preferredEditorMode).toBe("block");
		expect(note.richContent).toEqual(markdownToRichDocument("# Test"));
	});

	test("repairs legacy rich content when markdown contains tables and tasks", () => {
		const markdown = `# Meeting notes template

## Decisions

| Decision | Why | Owner |
| --- | --- | --- |
|  |  |  |

## Follow-ups

- [ ] Add an owner and date
`;

		const note = fromPersistedNote({
			id: "note-legacy" as never,
			name: "Meeting notes template.md",
			content: markdown as never,
			richContent: [
				{ type: "heading", props: { level: 1 }, content: "Meeting notes template" },
				{ type: "heading", props: { level: 2 }, content: "Decisions" },
				{ type: "paragraph", content: "| Decision | Why | Owner |" },
				{ type: "paragraph", content: "| --- | --- | --- |" },
				{ type: "paragraph", content: "|  |  |  |" },
				{ type: "heading", props: { level: 2 }, content: "Follow-ups" },
				{ type: "bulletListItem", content: "[ ] Add an owner and date" },
			] as never,
			preferredEditorMode: "block",
			parentId: "folder-1" as never,
			createdAt: "2026-03-01T10:00:00.000Z" as never,
			updatedAt: "2026-03-02T12:00:00.000Z" as never,
		});

		expect(note.richContent).toEqual(markdownToRichDocument(markdown));
	});

	test("maps persisted note versions back to note version models", () => {
		const version = fromPersistedNoteVersion({
			id: "version-1",
			note_id: "note-1",
			name: "Alpha.md",
			content: "# Alpha",
			rich_content: markdownToRichDocument("# Alpha"),
			preferred_editor_mode: "block",
			parent_id: null,
			tags: ["draft"],
			reason: "autosave",
			content_hash: "hash",
			created_at: "2026-03-03T12:00:00.000Z",
		});

		expect(version.id).toBe("version-1");
		expect(version.noteId).toBe("note-1");
		expect(version.createdAt.toISOString()).toBe("2026-03-03T12:00:00.000Z");
		expect(version.reason).toBe("autosave");
		expect(version.richContent).toEqual(markdownToRichDocument("# Alpha"));
	});
});
