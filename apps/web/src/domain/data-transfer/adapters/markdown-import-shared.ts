import { foldersFromNotePaths } from "@/domain/data-transfer/folders";
import {
	parseTagsField,
	splitFrontmatter,
} from "@/domain/data-transfer/frontmatter";
import { normalizeNoteFileName } from "@/domain/data-transfer/paths";
import type {
	ImportProfile,
	ParsedArchive,
	ParsedNoteFile,
	SkriuwExportManifestV1,
} from "@/domain/data-transfer/types";

export type MarkdownImportOptions = {
	skipPath?: (path: string) => boolean;
	transformBody?: (body: string, path: string) => string;
	extraTags?: (body: string, frontmatter: Record<string, string>) => string[];
	prepareBody?: (body: string, path: string) => {
		content: string;
		extraTags?: string[];
	};
};

export function defaultSkipMarkdownPath(path: string): boolean {
	const lower = path.toLowerCase();
	return (
		lower.endsWith(".rich.json") ||
		path.startsWith(".") ||
		path.includes("/.") ||
		lower.includes("/node_modules/")
	);
}

export function skipObsidianPath(path: string): boolean {
	const lower = path.toLowerCase();
	return (
		defaultSkipMarkdownPath(path) ||
		lower.includes("/.obsidian/") ||
		lower.includes("/.trash/") ||
		lower.endsWith(".canvas")
	);
}

export function skipNotionPath(path: string): boolean {
	const lower = path.toLowerCase();
	return (
		defaultSkipMarkdownPath(path) ||
		lower.endsWith(".csv") ||
		lower.endsWith(".png") ||
		lower.endsWith(".jpg") ||
		lower.endsWith(".jpeg") ||
		lower.endsWith(".gif") ||
		lower.endsWith(".webp") ||
		lower.endsWith(".pdf") ||
		lower.endsWith(".zip")
	);
}

/** Converts `[[Note]]` and `[[Note|Alias]]` to markdown links. */
export function convertObsidianWikilinks(content: string): string {
	return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => {
		const label = (alias ?? target).trim();
		const slug = String(target).trim();
		const href = slug.endsWith(".md") ? slug : `${slug}.md`;
		return `[${label}](${href})`;
	});
}

/** Bear notes often start with `#tag` lines before the body. */
export function extractBearTags(body: string): { tags: string[]; content: string } {
	const lines = body.split(/\r?\n/);
	const tags: string[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index].trim();
		if (!line) {
			index += 1;
			continue;
		}
		if (line.startsWith("#")) {
			const tag = line.replace(/^#+/, "").trim();
			if (tag) tags.push(tag);
			index += 1;
			continue;
		}
		break;
	}

	return {
		tags,
		content: lines.slice(index).join("\n").trimStart(),
	};
}

export function parseMarkdownNoteFile(
	path: string,
	raw: string,
	options: MarkdownImportOptions = {},
): ParsedNoteFile {
	const parts = path.split("/").filter(Boolean);
	const name = normalizeNoteFileName(parts.at(-1) ?? "untitled.md");
	const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
	const { frontmatter, body } = splitFrontmatter(raw);
	let transformedBody = body;
	let preparedTags: string[] = [];
	if (options.prepareBody) {
		const prepared = options.prepareBody(body, path);
		transformedBody = prepared.content;
		preparedTags = prepared.extraTags ?? [];
	} else {
		transformedBody = options.transformBody?.(body, path) ?? body;
		preparedTags = options.extraTags?.(body, frontmatter) ?? [];
	}
	// Only declared tags (frontmatter + adapter-supplied) survive the import.
	// Deriving tags from note text turned `#comment` lines in code/.env
	// snippets into workspace tags.
	const frontmatterTags = parseTagsField(frontmatter.tags);
	const tags = [...new Set([...frontmatterTags, ...preparedTags])];
	const sortOrderRaw = frontmatter.sortOrder;
	const sortOrder =
		sortOrderRaw !== undefined && sortOrderRaw !== "" ? Number(sortOrderRaw) : undefined;
	const preferredEditorMode = frontmatter.preferredEditorMode;

	return {
		id: frontmatter.id,
		name,
		content: transformedBody,
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

export function buildMarkdownImportArchive(
	notes: ParsedNoteFile[],
	profile: ImportProfile,
	integrityWarnings: string[],
): ParsedArchive {
	if (notes.length === 0) {
		throw new Error("No notes found in archive.");
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
		profile,
		integrityWarnings,
	};
}

export function inferImportFolders(archive: ParsedArchive) {
	return foldersFromNotePaths(archive.notes);
}

export function parseMarkdownEntries(
	entries: Record<string, string>,
	profile: ImportProfile,
	options: MarkdownImportOptions,
	baseWarnings: string[],
): ParsedArchive {
	const skipPath = options.skipPath ?? defaultSkipMarkdownPath;
	const notes: ParsedNoteFile[] = [];

	for (const [path, raw] of Object.entries(entries)) {
		if (!path.endsWith(".md") || skipPath(path)) continue;
		notes.push(parseMarkdownNoteFile(path, raw, options));
	}

	return buildMarkdownImportArchive(notes, profile, baseWarnings);
}
