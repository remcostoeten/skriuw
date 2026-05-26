import { extractNoteTags } from "@/domain/notes/note-links";
import { foldersFromNotePaths } from "@/domain/data-transfer/folders";
import {
	parseTagsField,
	splitFrontmatter,
} from "@/domain/data-transfer/frontmatter";
import { normalizeNoteFileName } from "@/domain/data-transfer/paths";
import type {
	ParsedArchive,
	ParsedNoteFile,
	SkriuwExportManifestV1,
} from "@/domain/data-transfer/types";

function shouldSkipMarkdownPath(path: string): boolean {
	const lower = path.toLowerCase();
	return (
		lower.includes("/.obsidian/") ||
		lower.includes("/.trash/") ||
		lower.endsWith(".rich.json") ||
		path.startsWith(".") ||
		path.includes("/.")
	);
}

function parseMarkdownNote(path: string, raw: string): ParsedNoteFile {
	const parts = path.split("/").filter(Boolean);
	const name = normalizeNoteFileName(parts.at(-1) ?? "untitled.md");
	const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
	const { frontmatter, body } = splitFrontmatter(raw);
	const frontmatterTags = parseTagsField(frontmatter.tags);
	const contentTags = extractNoteTags(body);
	const tags = [...new Set([...frontmatterTags, ...contentTags])];
	const sortOrderRaw = frontmatter.sortOrder;
	const sortOrder =
		sortOrderRaw !== undefined && sortOrderRaw !== "" ? Number(sortOrderRaw) : undefined;
	const preferredEditorMode = frontmatter.preferredEditorMode;

	return {
		id: frontmatter.id,
		name,
		content: body,
		tags,
		parentPath,
		sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
		preferredEditorMode:
			preferredEditorMode === "raw" || preferredEditorMode === "block"
				? preferredEditorMode
				: "raw",
		createdAt: frontmatter.created,
		updatedAt: frontmatter.updated,
		sourcePath: path,
	};
}

export function parseMarkdownVaultEntries(entries: Record<string, string>): ParsedArchive {
	const notes: ParsedNoteFile[] = [];

	for (const [path, raw] of Object.entries(entries)) {
		if (!path.endsWith(".md") || shouldSkipMarkdownPath(path)) continue;
		notes.push(parseMarkdownNote(path, raw));
	}

	if (notes.length === 0) {
		throw new Error("No Markdown notes found in archive.");
	}

	const manifest: SkriuwExportManifestV1 = {
		version: 1,
		source: "skriuw",
		exportedAt: new Date().toISOString(),
		counts: {
			notes: notes.length,
			journalEntries: 0,
		},
	};

	return {
		manifest,
		notes,
		journalEntries: [],
		noteVersions: [],
		rootPrefix: "",
		profile: "markdown-vault",
		integrityWarnings: [
			"Imported from Markdown folder. Folder structure was inferred from file paths.",
			"Journal entries and version history were not included.",
		],
	};
}

export function inferMarkdownVaultFolders(archive: ParsedArchive) {
	return foldersFromNotePaths(archive.notes);
}
