import { unzipSync, type UnzipFileInfo } from "fflate";
import { validateArchiveIntegrity } from "@/domain/data-transfer/integrity";
import { MAX_ARCHIVE_ENTRIES, MAX_UNCOMPRESSED_BYTES } from "@/domain/data-transfer/limits";
import {
	findExportRootPrefix,
	isNoteRichSidecarPath,
	isNoteVersionPath,
	journalDateFromArchivePath,
	notePathFromArchivePath,
	noteRichSidecarPath,
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
	ParsedNoteVersion,
	SkriuwExportManifest,
	SkriuwExportManifestV3,
} from "@/domain/data-transfer/types";
import { isSkriuwManifestV2OrV3 } from "@/domain/data-transfer/types";

function isManifest(value: unknown): value is SkriuwExportManifest {
	if (!value || typeof value !== "object") return false;
	const manifest = value as SkriuwExportManifest;
	return (
		(manifest.version === 1 || manifest.version === 2 || manifest.version === 3) &&
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
	const preferredEditorMode = String(frontmatter.preferredEditorMode ?? "");

	const sortOrder = String(frontmatter.sortOrder ?? "");
	const sortOrderValue = sortOrder !== "" ? Number(sortOrder) : undefined;

	return {
		id: String(frontmatter.id ?? ""),
		name: location.name,
		content: body,
		tags: parseTagsField(frontmatter.tags),
		parentPath: location.parentPath,
		sortOrder: Number.isFinite(sortOrderValue) ? sortOrderValue : undefined,
		preferredEditorMode:
			preferredEditorMode === "raw" || preferredEditorMode === "block"
				? preferredEditorMode
				: undefined,
		icon: String(frontmatter.icon ?? ""),
		createdAt: String(frontmatter.created ?? ""),
		updatedAt: String(frontmatter.updated ?? ""),
		sourcePath: path,
	};
}

function parseJournalFile(path: string, raw: string, rootPrefix: string): ParsedJournalFile | null {
	const dateKey = journalDateFromArchivePath(rootPrefix, path);
	if (!dateKey) return null;

	const { frontmatter, body } = splitFrontmatter(raw);
	const moodRaw = frontmatter.mood;
	const mood = parseYamlString(moodRaw != null ? String(moodRaw) : undefined);

	return {
		id: String(frontmatter.id ?? ""),
		dateKey: String(frontmatter.date ?? dateKey),
		content: body,
		mood,
		tags: parseTagsField(frontmatter.tags),
		sourcePath: path,
	};
}

function parseNoteVersionFile(path: string, raw: string): ParsedNoteVersion {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`Malformed note version file: ${path}`);
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error(`Malformed note version file: ${path}`);
	}

	const version = parsed as Record<string, unknown>;
	const preferredEditorMode = version.preferredEditorMode;
	if (
		typeof version.id !== "string" ||
		typeof version.noteId !== "string" ||
		typeof version.name !== "string" ||
		typeof version.content !== "string" ||
		typeof version.reason !== "string" ||
		typeof version.contentHash !== "string" ||
		typeof version.createdAt !== "string" ||
		(preferredEditorMode !== "raw" && preferredEditorMode !== "block")
	) {
		throw new Error(`Malformed note version file: ${path}`);
	}

	return {
		id: version.id,
		noteId: version.noteId,
		name: version.name,
		content: version.content,
		richContent: version.richContent,
		preferredEditorMode,
		parentId: typeof version.parentId === "string" ? version.parentId : null,
		tags: Array.isArray(version.tags) ? version.tags.map(String) : [],
		reason: version.reason,
		contentHash: version.contentHash,
		createdAt: version.createdAt,
		sourcePath: path,
	};
}

export function decodeArchiveEntries(buffer: Uint8Array): Record<string, string> {
	let entryCount = 0;
	let totalUncompressed = 0;

	let unzipped: Record<string, Uint8Array>;
	try {
		unzipped = unzipSync(buffer, {
			filter: (file: UnzipFileInfo) => {
				if (file.name.endsWith("/")) return false;

				entryCount += 1;
				if (entryCount > MAX_ARCHIVE_ENTRIES) {
					throw new Error("Archive contains too many files.");
				}

				totalUncompressed += file.originalSize;
				if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
					throw new Error("Archive uncompressed size is too large.");
				}

				return true;
			},
		});
	} catch (error) {
		if (
			error instanceof Error &&
			(error.message === "Archive contains too many files." ||
				error.message === "Archive uncompressed size is too large.")
		) {
			throw error;
		}
		throw new Error("Invalid ZIP archive.");
	}

	const entries: Record<string, string> = {};
	for (const [path, bytes] of Object.entries(unzipped)) {
		entries[path] = new TextDecoder().decode(bytes);
	}
	return entries;
}

export function parseSkriuwArchiveEntries(entries: Record<string, string>): ParsedArchive {
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

	if (isSkriuwManifestV2OrV3(manifestJson)) {
		if (!Array.isArray(manifestJson.folders) || !Array.isArray(manifestJson.journalTags)) {
			throw new Error(`Malformed v${manifestJson.version} export manifest.`);
		}
	}

	const notes: ParsedNoteFile[] = [];
	const journalEntries: ParsedJournalFile[] = [];
	const noteVersions: ParsedNoteVersion[] = [];
	const richSidecars = new Map<string, unknown>();
	const integrityWarnings: string[] = [];

	for (const [path, raw] of Object.entries(entries)) {
		if (path === `${rootPrefix}/skriuw-export.json`) continue;

		if (isNoteRichSidecarPath(rootPrefix, path)) {
			try {
				richSidecars.set(path, JSON.parse(raw));
			} catch {
				throw new Error(`Malformed rich content sidecar: ${path}`);
			}
			continue;
		}

		if (isNoteVersionPath(rootPrefix, path)) {
			noteVersions.push(parseNoteVersionFile(path, raw));
			continue;
		}

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

	for (const note of notes) {
		const richContent = richSidecars.get(noteRichSidecarPath(note.sourcePath));
		if (richContent !== undefined) {
			note.richContent = richContent;
		}
	}

	if (manifestJson.version === 3) {
		integrityWarnings.push(
			...validateArchiveIntegrity(
				rootPrefix,
				entries,
				manifestJson as SkriuwExportManifestV3,
			),
		);
	}

	return {
		manifest: manifestJson,
		notes,
		journalEntries,
		noteVersions,
		rootPrefix,
		profile: "skriuw",
		integrityWarnings,
	};
}

export function parseArchiveBuffer(buffer: Uint8Array): ParsedArchive {
	return parseSkriuwArchiveEntries(decodeArchiveEntries(buffer));
}
