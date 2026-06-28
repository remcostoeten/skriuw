import { describe, expect, test } from "bun:test";
import { parseAppleNotesEntries } from "@/domain/data-transfer/adapters/apple-notes";
import { parseBearExportEntries } from "@/domain/data-transfer/adapters/bear";
import {
	convertObsidianWikilinks,
	extractBearTags,
} from "@/domain/data-transfer/adapters/markdown-import-shared";
import { parseNotionExportEntries } from "@/domain/data-transfer/adapters/notion";
import { parseObsidianVaultEntries } from "@/domain/data-transfer/adapters/obsidian";
import { parseSimplenoteEntries } from "@/domain/data-transfer/adapters/simplenote";
import { detectImportProfile } from "@/domain/data-transfer/parse-import";

function simplenoteFixture(): Record<string, string> {
	return {
		"source/notes.json": JSON.stringify({
			activeNotes: [
				{
					id: "11111111-1111-1111-1111-111111111111",
					content: "Shopping list\r\nmilk\r\neggs #errand",
					creationDate: "2026-01-02T10:00:00.000Z",
					lastModified: "2026-01-03T10:00:00.000Z",
					tags: ["home"],
					markdown: false,
				},
				{
					id: "22222222-2222-2222-2222-222222222222",
					content: "Shopping list\r\nsecond note with same title",
					creationDate: "2026-01-04T10:00:00.000Z",
					lastModified: "2026-01-04T10:00:00.000Z",
				},
				{
					id: "33333333-3333-3333-3333-333333333333",
					content: "",
				},
			],
			trashedNotes: [
				{
					id: "44444444-4444-4444-4444-444444444444",
					content: "Old idea",
					creationDate: "2025-12-01T10:00:00.000Z",
					lastModified: "2025-12-01T10:00:00.000Z",
				},
			],
		}),
		"Shopping list.txt": "Shopping list\nmilk\neggs",
	};
}

describe("import adapters", () => {
	test("converts obsidian wikilinks to markdown links", () => {
		expect(convertObsidianWikilinks("See [[Other Note]] and [[Target|Alias]]")).toBe(
			"See [Other Note](Other Note.md) and [Alias](Target.md)",
		);
	});

	test("extracts bear header tags", () => {
		expect(extractBearTags("#ideas\n#draft\n\nBody text")).toEqual({
			tags: ["ideas", "draft"],
			content: "Body text",
		});
	});

	test("detects apple notes html archives", () => {
		expect(
			detectImportProfile({
				"Meeting Notes.html": "<html><body><h1>Meeting</h1><p>Notes</p></body></html>",
			}),
		).toBe("apple-notes");
	});

	test("detects obsidian vaults with .obsidian metadata", () => {
		expect(
			detectImportProfile({
				".obsidian/app.json": "{}",
				"Projects/plan.md": "# Plan",
			}),
		).toBe("obsidian");
	});

	test("detects notion export paths", () => {
		expect(
			detectImportProfile({
				"ExportBlock-abc/Private & Shared/Home/Welcome.md": "# Welcome",
			}),
		).toBe("notion");
	});

	test("parses obsidian notes and converts wikilinks", () => {
		const archive = parseObsidianVaultEntries({
			"notes/idea.md": "# Idea\n\nLink to [[Other]]",
		});

		expect(archive.profile).toBe("obsidian");
		expect(archive.notes[0]?.content).toContain("[Other](Other.md)");
	});

	test("parses apple notes html into markdown notes", () => {
		const archive = parseAppleNotesEntries({
			"Journal/Daily.html": "<html><body><h1>Daily</h1><p>Hello world</p></body></html>",
		});

		expect(archive.profile).toBe("apple-notes");
		expect(archive.notes[0]?.name).toBe("Daily.md");
		expect(archive.notes[0]?.content).toContain("Hello world");
	});

	test("parses bear markdown with header tags", () => {
		const archive = parseBearExportEntries({
			"ideas.md": "#ideas\n#draft\n\nBear body",
		});

		expect(archive.profile).toBe("bear");
		expect(archive.notes[0]?.tags).toEqual(["ideas", "draft"]);
		expect(archive.notes[0]?.content).toBe("Bear body");
	});

	test("parses notion markdown exports and skips attachments", () => {
		const archive = parseNotionExportEntries({
			"ExportBlock-abc/Home/Welcome.md": "# Welcome",
			"ExportBlock-abc/Home/image.png": "binary",
			"ExportBlock-abc/Home/data.csv": "a,b",
		});

		expect(archive.profile).toBe("notion");
		expect(archive.notes).toHaveLength(1);
		expect(archive.notes[0]?.name).toBe("Welcome.md");
	});

	test("detects simplenote exports by notes.json shape", () => {
		expect(detectImportProfile(simplenoteFixture())).toBe("simplenote");
	});

	test("parses simplenote notes, titles, tags, and dedupes collisions", () => {
		const archive = parseSimplenoteEntries(simplenoteFixture());

		expect(archive.profile).toBe("simplenote");
		expect(archive.notes).toHaveLength(4);

		const first = archive.notes[0];
		expect(first?.id).toBe("11111111-1111-1111-1111-111111111111");
		expect(first?.name).toBe("Shopping list.md");
		expect(first?.parentPath).toBeNull();
		expect(first?.deleted).toBe(false);
		expect(first?.content).toBe("Shopping list\nmilk\neggs #errand");
		expect(first?.tags).toEqual(["home", "errand"]);
		expect(first?.createdAt).toBe("2026-01-02T10:00:00.000Z");
		expect(first?.preferredEditorMode).toBe("raw");

		expect(archive.notes[1]?.name).toBe("Shopping list (2).md");
		expect(archive.notes[2]?.name).toBe("untitled.md");

		const trashed = archive.notes[3];
		expect(trashed?.parentPath).toBeNull();
		expect(trashed?.deleted).toBe(true);
		expect(trashed?.name).toBe("Old idea.md");
	});
});
