import { unzipSync } from "fflate";
import {
	journalDateFromArchivePath,
	notePathFromArchivePath,
	findExportRootPrefix,
} from "@/domain/data-transfer/paths";
import {
	parseTagsField,
	parseYamlString,
	splitFrontmatter,
} from "@/domain/data-transfer/frontmatter";
import type {
	ParsedArchive,
	ParsedJournalFile,
	ParsedNoteFile,
	SkriuwExportManifest,
	SkriuwExportManifestV2,
} from "@/domain/data-transfer/types";

function isManifest(value: unknown): value is SkriuwExportManifest {
	if (!value || typeof value !== "object") return false;
	const manifest = value as SkriuwExportManifest;
	return (
		(manifest.version === 1 || manifest.version === 2) &&
		manifest.source === "skriuw" &&
		typeof manifest.exportedAt === "string" &&
		typeof manifest.counts?.notes === "number" &&
		typeof manifest.counts?.journalEntries === "number"
	);
}

function parseNoteFile(path: string, raw: string, rootPrefix: string): ParsedNoteFile | null {
	const location = notePathFromArchivePath(rootPrefix, path);
	if (!location) return null;

	const { frontmatter, body } = splitFrontmatter(raw);
	const preferredEditorMode = frontmatter.preferredEditorMode;
	const sortOrder = frontmatter.sortOrder ? Number(frontmatter.sortOrder) : undefined;

	return {
		id: frontmatter.id,
		name: location.name,
		content: body,
		tags: parseTagsField(frontmatter.tags),
		parentPath: location.parentPath,
		sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
		preferredEditorMode:
			preferredEditorMode === "raw" || preferredEditorMode === "block"
				? preferredEditorMode
				: undefined,
		createdAt: frontmatter.created,
		updatedAt: frontmatter.updated,
		sourcePath: path,
	};
}

function parseJournalFile(path: string, raw: string, rootPrefix: string): ParsedJournalFile | null {
	const dateKey = journalDateFromArchivePath(rootPrefix, path);
	if (!dateKey) return null;

	const { frontmatter, body } = splitFrontmatter(raw);
	const mood = parseYamlString(frontmatter.mood);

	return {
		id: frontmatter.id,
		dateKey: frontmatter.date ?? dateKey,
		content: body,
		mood,
		tags: parseTagsField(frontmatter.tags),
		sourcePath: path,
	};
}

export function decodeArchiveEntries(buffer: Uint8Array): Record<string, string> {
	let unzipped: Record<string, Uint8Array>;
	try {
		unzipped = unzipSync(buffer);
	} catch {
		throw new Error("Invalid ZIP archive.");
	}

	const entries: Record<string, string> = {};
	for (const [path, bytes] of Object.entries(unzipped)) {
		if (path.endsWith("/")) continue;
		entries[path] = new TextDecoder().decode(bytes);
	}
	return entries;
}

export function parseArchiveBuffer(buffer: Uint8Array): ParsedArchive {
	const entries = decodeArchiveEntries(buffer);
	const paths = Object.keys(entries);
	const rootPrefix = findExportRootPrefix(paths);
	if (!rootPrefix) {
		throw new Error("Missing skriuw-export.json manifest.");
	}

	const manifestRaw = entries[`${rootPrefix}/skriuw-export.json`];
	if (!manifestRaw) {
		throw new Error("Missing skriuw-export.json manifest.");
	}

	let manifestJson: unknown;
	try {
		manifestJson = JSON.parse(manifestRaw);
	} catch {
		throw new Error("Malformed skriuw-export.json manifest.");
	}

	if (!isManifest(manifestJson)) {
		throw new Error("Unsupported export manifest.");
	}

	const notes: ParsedNoteFile[] = [];
	const journalEntries: ParsedJournalFile[] = [];

	for (const [path, raw] of Object.entries(entries)) {
		if (path === `${rootPrefix}/skriuw-export.json`) continue;

		const note = parseNoteFile(path, raw, rootPrefix);
		if (note) {
			notes.push(note);
			continue;
		}

		const journalEntry = parseJournalFile(path, raw, rootPrefix);
		if (journalEntry) {
			journalEntries.push(journalEntry);
		}
	}

	if (manifestJson.version === 2) {
		const manifest = manifestJson as SkriuwExportManifestV2;
		if (!Array.isArray(manifest.folders) || !Array.isArray(manifest.journalTags)) {
			throw new Error("Malformed v2 export manifest.");
		}
	}

	return {
		manifest: manifestJson,
		notes,
		journalEntries,
		rootPrefix,
	};
}
