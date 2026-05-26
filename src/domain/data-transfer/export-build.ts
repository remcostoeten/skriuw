import type { Prisma } from "@/generated/prisma/client";
import { strToU8 } from "fflate";
import { exportFolderPaths } from "@/domain/data-transfer/folders";
import { buildArchiveChecksums } from "@/domain/data-transfer/integrity";
import {
	normalizeNoteFileName,
	noteRichSidecarPath,
	noteVersionPath,
	safeArchiveName,
	uniqueArchivePath,
} from "@/domain/data-transfer/paths";
import { yamlString, yamlTags } from "@/domain/data-transfer/frontmatter";
import {
	SKRIUW_EXPORT_SOURCE,
	SKRIUW_EXPORT_VERSION,
	type SkriuwExportManifestV3,
} from "@/domain/data-transfer/types";

type FolderRow = { id: string; name: string; parentId: string | null; sortOrder: number };
type NoteRow = {
	id: string;
	name: string;
	content: string;
	richContent: Prisma.JsonValue | null;
	tags: string[];
	parentId: string | null;
	sortOrder: number;
	preferredEditorMode: string | null;
	createdAt: Date;
	updatedAt: Date;
};
type JournalRow = {
	id: string;
	dateKey: string;
	content: string;
	mood: string | null;
	tags: string[];
};
type JournalTagRow = { name: string; color: string };
type NoteVersionRow = {
	id: string;
	noteId: string;
	name: string;
	content: string;
	richContent: Prisma.JsonValue | null;
	preferredEditorMode: string;
	parentId: string | null;
	tags: string[];
	reason: string;
	contentHash: string;
	createdAt: Date;
};

function noteFrontmatter(note: NoteRow): string {
	const lines = ["---"];
	lines.push(`id: ${note.id}`);
	if (note.tags.length) lines.push(`tags: ${yamlTags(note.tags)}`);
	lines.push(`sortOrder: ${note.sortOrder}`);
	if (note.preferredEditorMode) {
		lines.push(`preferredEditorMode: ${note.preferredEditorMode}`);
	}
	lines.push(`created: ${note.createdAt.toISOString()}`);
	lines.push(`updated: ${note.updatedAt.toISOString()}`);
	lines.push("---", "", "");
	return lines.join("\n");
}

function journalFrontmatter(entry: JournalRow): string {
	const lines = ["---"];
	lines.push(`id: ${entry.id}`);
	lines.push(`date: ${entry.dateKey}`);
	if (entry.mood) lines.push(`mood: ${yamlString(entry.mood)}`);
	if (entry.tags.length) lines.push(`tags: ${yamlTags(entry.tags)}`);
	lines.push("---", "", "");
	return lines.join("\n");
}

export function buildExportArchiveFiles(input: {
	folders: FolderRow[];
	notes: NoteRow[];
	journalEntries: JournalRow[];
	journalTags: JournalTagRow[];
	noteVersions?: NoteVersionRow[];
	includeVersions?: boolean;
	exportedAt?: Date;
}): Record<string, Uint8Array> {
	const { folders, notes, journalEntries, journalTags } = input;
	const includeVersions = input.includeVersions ?? true;
	const noteVersions = includeVersions ? (input.noteVersions ?? []) : [];
	const exportedAt = input.exportedAt ?? new Date();
	const dateSlug = exportedAt.toISOString().slice(0, 10);
	const root = `skriuw-export-${dateSlug}`;
	const files: Record<string, Uint8Array> = {};
	const folderPaths = exportFolderPaths(folders);

	for (const note of notes) {
		const folderPath = note.parentId ? folderPaths.get(note.parentId) : undefined;
		const noteName = safeArchiveName(normalizeNoteFileName(note.name));
		const desired = folderPath
			? `${root}/notes/${folderPath}/${noteName}`
			: `${root}/notes/${noteName}`;
		const filePath = uniqueArchivePath(files, desired);
		files[filePath] = strToU8(noteFrontmatter(note) + note.content);
		if (note.richContent != null) {
			files[noteRichSidecarPath(filePath)] = strToU8(
				JSON.stringify(note.richContent, null, 2),
			);
		}
	}

	for (const version of noteVersions) {
		const versionPath = noteVersionPath(root, version.noteId, version.id);
		files[versionPath] = strToU8(
			JSON.stringify(
				{
					id: version.id,
					noteId: version.noteId,
					name: version.name,
					content: version.content,
					richContent: version.richContent,
					preferredEditorMode: version.preferredEditorMode,
					parentId: version.parentId,
					tags: version.tags,
					reason: version.reason,
					contentHash: version.contentHash,
					createdAt: version.createdAt.toISOString(),
				},
				null,
				2,
			),
		);
	}

	for (const entry of journalEntries) {
		const desired = `${root}/journal/${entry.dateKey}.md`;
		const filePath = uniqueArchivePath(files, desired);
		files[filePath] = strToU8(journalFrontmatter(entry) + entry.content);
	}

	const stringEntries: Record<string, string> = {};
	for (const [path, bytes] of Object.entries(files)) {
		stringEntries[path] = new TextDecoder().decode(bytes);
	}

	const checksums = buildArchiveChecksums(root, stringEntries);

	const manifest: SkriuwExportManifestV3 = {
		version: SKRIUW_EXPORT_VERSION,
		source: SKRIUW_EXPORT_SOURCE,
		exportedAt: exportedAt.toISOString(),
		options: { includeVersions },
		counts: {
			notes: notes.length,
			journalEntries: journalEntries.length,
			folders: folders.length,
			journalTags: journalTags.length,
			noteVersions: noteVersions.length,
		},
		folders: folders.map((folder) => ({
			id: folder.id,
			name: folder.name,
			parentId: folder.parentId,
			sortOrder: folder.sortOrder,
		})),
		journalTags,
		checksums,
	};

	files[`${root}/skriuw-export.json`] = strToU8(JSON.stringify(manifest, null, 2));
	return files;
}

export function getExportRootPrefix(files: Record<string, Uint8Array>): string {
	const manifestPath = Object.keys(files).find((path) => path.endsWith("/skriuw-export.json"));
	if (!manifestPath) {
		throw new Error("Export archive is missing manifest.");
	}
	return manifestPath.slice(0, -"/skriuw-export.json".length);
}

export function getExportDownloadName(exportedAt = new Date()): string {
	return `skriuw-export-${exportedAt.toISOString().slice(0, 10)}.zip`;
}
