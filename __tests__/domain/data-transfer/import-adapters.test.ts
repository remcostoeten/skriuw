import { describe, expect, test } from "bun:test";
import { parseAppleNotesEntries } from "@/domain/data-transfer/adapters/apple-notes";
import { parseBearExportEntries } from "@/domain/data-transfer/adapters/bear";
import {
	convertObsidianWikilinks,
	extractBearTags,
} from "@/domain/data-transfer/adapters/markdown-import-shared";
import { parseNotionExportEntries } from "@/domain/data-transfer/adapters/notion";
import { parseObsidianVaultEntries } from "@/domain/data-transfer/adapters/obsidian";
import { detectImportProfile } from "@/domain/data-transfer/parse-import";

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
});
