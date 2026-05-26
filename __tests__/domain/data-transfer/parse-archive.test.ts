import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { buildExportArchiveFiles } from "@/domain/data-transfer/export-build";
import { resolveManifestFolders } from "@/domain/data-transfer/preview";
import { parseArchiveBuffer } from "@/domain/data-transfer/parse-archive";

const sampleRichContent = [
	{
		id: "block-1",
		type: "paragraph",
		props: {},
		content: [{ type: "text", text: "Block body", styles: {} }],
		children: [],
	},
];

describe("data transfer archive parsing", () => {
	test("round-trips a generated v2 export archive", () => {
		const files = buildExportArchiveFiles({
			folders: [
				{
					id: "22222222-2222-4222-8222-222222222222",
					name: "Projects",
					parentId: null,
					sortOrder: 0,
				},
				{
					id: "44444444-4444-4444-8444-444444444444",
					name: "Empty",
					parentId: null,
					sortOrder: 1,
				},
			],
			notes: [
				{
					id: "11111111-1111-4111-8111-111111111111",
					name: "Idea.md",
					content: "# Idea\n\nBody",
					richContent: sampleRichContent,
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
		expect(archive.notes[0]?.richContent).toEqual(sampleRichContent);
		expect(archive.journalEntries).toHaveLength(1);
		expect(archive.journalEntries[0]?.dateKey).toBe("2026-05-26");
		expect(archive.journalEntries[0]?.mood).toBe("calm");

		const manifest = archive.manifest;
		if (manifest.version !== 2) throw new Error("Expected v2 manifest");
		expect(manifest.folders).toHaveLength(2);
		expect(resolveManifestFolders(archive)).toHaveLength(2);
	});

	test("parses legacy v1 exports and infers folders from note paths", () => {
		const root = "skriuw-export-2026-05-26";
		const zip = zipSync({
			[`${root}/skriuw-export.json`]: strToU8(
				JSON.stringify({
					version: 1,
					source: "skriuw",
					exportedAt: "2026-05-26T12:00:00.000Z",
					counts: { notes: 1, journalEntries: 0 },
				}),
			),
			[`${root}/notes/Projects/Idea.md`]: strToU8(`---
id: 11111111-1111-4111-8111-111111111111
created: 2026-05-26T10:00:00.000Z
updated: 2026-05-26T11:00:00.000Z
---

# Idea
`),
		});

		const archive = parseArchiveBuffer(zip);

		expect(archive.manifest.version).toBe(1);
		expect(archive.notes[0]?.parentPath).toBe("Projects");
		expect(resolveManifestFolders(archive)).toEqual([
			{
				id: "path:Projects",
				name: "Projects",
				parentId: null,
				sortOrder: 0,
			},
		]);
	});

	test("rejects invalid zip archives", () => {
		expect(() => parseArchiveBuffer(strToU8("not-a-zip"))).toThrow("Invalid ZIP archive.");
	});

	test("rejects archives without manifest", () => {
		const zip = zipSync({ "notes/example.md": strToU8("hello") });
		expect(() => parseArchiveBuffer(zip)).toThrow("Missing skriuw-export.json manifest.");
	});

	test("rejects malformed rich content sidecars", () => {
		const root = "skriuw-export-2026-05-26";
		const zip = zipSync({
			[`${root}/skriuw-export.json`]: strToU8(
				JSON.stringify({
					version: 2,
					source: "skriuw",
					exportedAt: "2026-05-26T12:00:00.000Z",
					counts: { notes: 1, journalEntries: 0, folders: 0, journalTags: 0 },
					folders: [],
					journalTags: [],
				}),
			),
			[`${root}/notes/Idea.md`]: strToU8("---\nid: abc\n---\n\nBody"),
			[`${root}/notes/Idea.rich.json`]: strToU8("{not-json"),
		});

		expect(() => parseArchiveBuffer(zip)).toThrow("Malformed rich content sidecar");
	});
});
