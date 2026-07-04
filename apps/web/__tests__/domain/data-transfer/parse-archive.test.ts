import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { parseMarkdownVaultEntries } from "@/domain/data-transfer/adapters/markdown-vault";
import { buildExportArchiveFiles } from "@/domain/data-transfer/export-build";
import { sha256Hex } from "@/domain/data-transfer/integrity";
import { detectImportProfile } from "@/domain/data-transfer/parse-import";
import { decodeArchiveEntries, parseArchiveBuffer } from "@/domain/data-transfer/parse-archive";
import { journalDateFromArchivePath } from "@/domain/data-transfer/paths";
import { resolveManifestFolders } from "@/domain/data-transfer/preview";

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
	test("round-trips a generated v3 export archive", () => {
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
					icon: null,
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
			noteVersions: [
				{
					id: "55555555-5555-4555-8555-555555555555",
					noteId: "11111111-1111-4111-8111-111111111111",
					name: "Idea.md",
					content: "# Idea\n\nOlder body",
					richContent: sampleRichContent,
					preferredEditorMode: "block",
					parentId: "22222222-2222-4222-8222-222222222222",
					tags: ["draft"],
					reason: "autosave",
					contentHash: "abc123",
					createdAt: new Date("2026-05-26T09:00:00.000Z"),
				},
			],
			exportedAt: new Date("2026-05-26T12:00:00.000Z"),
		});

		const archive = parseArchiveBuffer(zipSync(files));

		expect(archive.manifest.version).toBe(3);
		expect(archive.profile).toBe("skriuw");
		if (archive.manifest.version !== 3) throw new Error("Expected v3 manifest");
		expect(archive.manifest.folders).toHaveLength(2);
		expect(archive.manifest.folders[0]?.name).toBe("Projects");
		expect(archive.manifest.folders[1]?.name).toBe("Empty");
		expect(archive.notes).toHaveLength(1);
		expect(archive.notes[0]?.content).toBe("\n# Idea\n\nBody");
		expect(archive.notes[0]?.richContent).toEqual(sampleRichContent);
		expect(archive.noteVersions).toHaveLength(1);
		expect(archive.noteVersions[0]?.noteId).toBe("11111111-1111-4111-8111-111111111111");
		expect(archive.manifest.checksums).toBeDefined();
		expect(archive.manifest.counts.noteVersions).toBe(1);
		expect(archive.integrityWarnings).toEqual([]);
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
		expect(archive.noteVersions).toEqual([]);
		expect(resolveManifestFolders(archive)).toEqual([
			{
				id: "path:Projects",
				name: "Projects",
				parentId: null,
				sortOrder: 0,
			},
		]);
	});

	test("detects and parses markdown vault archives", () => {
		const zip = zipSync({
			"Projects/Idea.md": strToU8(`---
tags: ["idea"]
---

# Imported idea
`),
		});

		const entries = decodeArchiveEntries(zip);
		expect(detectImportProfile(entries)).toBe("markdown-vault");

		const archive = parseMarkdownVaultEntries(entries);
		expect(archive.profile).toBe("markdown-vault");
		expect(archive.notes).toHaveLength(1);
		expect(archive.notes[0]?.parentPath).toBe("Projects");
		expect(archive.notes[0]?.preferredEditorMode).toBe("raw");
	});

	test("reports checksum mismatches for v3 archives", () => {
		const root = "skriuw-export-2026-05-26";
		const notePath = `${root}/notes/Idea.md`;
		const noteBody = "---\nid: abc\n---\n\nBody";
		const zip = zipSync({
			[`${root}/skriuw-export.json`]: strToU8(
				JSON.stringify({
					version: 3,
					source: "skriuw",
					exportedAt: "2026-05-26T12:00:00.000Z",
					options: { includeVersions: false },
					counts: {
						notes: 1,
						journalEntries: 0,
						folders: 0,
						journalTags: 0,
						noteVersions: 0,
					},
					folders: [],
					journalTags: [],
					checksums: {
						"notes/Idea.md": sha256Hex("tampered"),
					},
				}),
			),
			[notePath]: strToU8(noteBody),
		});

		const archive = parseArchiveBuffer(zip);
		expect(
			archive.integrityWarnings.some((warning) => warning.includes("Checksum mismatch")),
		).toBe(true);
	});

	test("rejects invalid zip archives", () => {
		expect(() => parseArchiveBuffer(strToU8("not-a-zip"))).toThrow("Invalid ZIP archive.");
	});

	test("rejects archives without manifest for skriuw profile", () => {
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

	test("preserves sortOrder zero in parsed notes", () => {
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
			[`${root}/notes/Idea.md`]: strToU8(`---
id: 11111111-1111-4111-8111-111111111111
sortOrder: 0
created: 2026-05-26T10:00:00.000Z
updated: 2026-05-26T11:00:00.000Z
---

# Idea
`),
		});

		const archive = parseArchiveBuffer(zip);
		expect(archive.notes[0]?.sortOrder).toBe(0);
	});

	test("rejects impossible journal dates", () => {
		const root = "skriuw-export-2026-05-26";
		expect(journalDateFromArchivePath(root, `${root}/journal/2026-02-31.md`)).toBeNull();
		expect(journalDateFromArchivePath(root, `${root}/journal/2026-05-26.md`)).toBe(
			"2026-05-26",
		);
	});
});
