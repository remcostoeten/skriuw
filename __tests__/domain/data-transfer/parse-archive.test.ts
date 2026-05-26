import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { buildExportArchiveFiles } from "@/domain/data-transfer/export-build";
import { parseArchiveBuffer } from "@/domain/data-transfer/parse-archive";

describe("data transfer archive parsing", () => {
	test("round-trips a generated export archive", () => {
		const files = buildExportArchiveFiles({
			folders: [
				{
					id: "22222222-2222-4222-8222-222222222222",
					name: "Projects",
					parentId: null,
					sortOrder: 0,
				},
			],
			notes: [
				{
					id: "11111111-1111-4111-8111-111111111111",
					name: "Idea.md",
					content: "# Idea\n\nBody",
					tags: ["draft"],
					parentId: "22222222-2222-4222-8222-222222222222",
					sortOrder: 1,
					preferredEditorMode: "block",
					createdAt: new Date("2026-05-26T10:00:00.000Z"),
					updatedAt: new Date("2026-05-26T11:00:00.000Z"),
				},
			],
			journalEntries: [
				{
					id: "33333333-3333-4333-8333-333333333333",
					dateKey: "2026-05-26",
					content: "Journal body",
					mood: "calm",
					tags: ["daily"],
				},
			],
			journalTags: [{ name: "daily", color: "#64748b" }],
			exportedAt: new Date("2026-05-26T12:00:00.000Z"),
		});

		const archive = parseArchiveBuffer(zipSync(files));

		expect(archive.manifest.version).toBe(2);
		expect(archive.notes).toHaveLength(1);
		expect(archive.notes[0]?.content).toBe("\n# Idea\n\nBody");
		expect(archive.notes[0]?.parentPath).toBe("Projects");
		expect(archive.notes[0]?.tags).toEqual(["draft"]);
		expect(archive.journalEntries).toHaveLength(1);
		expect(archive.journalEntries[0]?.dateKey).toBe("2026-05-26");
		expect(archive.journalEntries[0]?.mood).toBe("calm");
	});

	test("rejects invalid zip archives", () => {
		expect(() => parseArchiveBuffer(strToU8("not-a-zip"))).toThrow("Invalid ZIP archive.");
	});

	test("rejects archives without manifest", () => {
		const zip = zipSync({ "notes/example.md": strToU8("hello") });
		expect(() => parseArchiveBuffer(zip)).toThrow("Missing skriuw-export.json manifest.");
	});
});
