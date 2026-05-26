import type { PrismaClient } from "@/generated/prisma/client";
import {
	exportFolderPaths,
	foldersFromNotePaths,
	sortFoldersForCreation,
} from "@/domain/data-transfer/folders";
import type {
	ImportPreview,
	ParsedArchive,
	SkriuwExportFolder,
	SkriuwExportManifestV2,
} from "@/domain/data-transfer/types";

type FolderRow = { id: string; name: string; parentId: string | null };

function buildFolderPaths(folders: FolderRow[]): Map<string, string> {
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	const cache = new Map<string, string>();

	function getPath(id: string): string {
		if (cache.has(id)) return cache.get(id)!;
		const folder = byId.get(id);
		if (!folder) return "";
		const parent = folder.parentId ? getPath(folder.parentId) : "";
		const path = parent ? `${parent}/${folder.name}` : folder.name;
		cache.set(id, path);
		return path;
	}

	for (const folder of folders) getPath(folder.id);
	return cache;
}

function resolveManifestFolders(archive: ParsedArchive): SkriuwExportFolder[] {
	if (archive.manifest.version === 2) {
		return (archive.manifest as SkriuwExportManifestV2).folders;
	}
	return foldersFromNotePaths(archive.notes);
}

export async function buildImportPreview(
	prisma: PrismaClient,
	userId: string,
	archive: ParsedArchive,
): Promise<ImportPreview> {
	const [existingFolders, existingNotes, existingJournalEntries, existingJournalTags] =
		await Promise.all([
			prisma.folder.findMany({
				where: { userId, deletedAt: null },
				select: { id: true, name: true, parentId: true },
			}),
			prisma.note.findMany({
				where: { userId, deletedAt: null },
				select: { id: true, name: true, parentId: true },
			}),
			prisma.journalEntry.findMany({
				where: { userId, deletedAt: null },
				select: { dateKey: true },
			}),
			prisma.journalTag.findMany({
				where: { userId, deletedAt: null },
				select: { name: true },
			}),
		]);

	const existingFolderPaths = buildFolderPaths(existingFolders);
	const existingFolderPathSet = new Set(existingFolderPaths.values());
	const existingNoteIds = new Set(existingNotes.map((note) => note.id));
	const existingNoteKeys = new Set(
		existingNotes.map((note) => {
			const parentPath = note.parentId ? existingFolderPaths.get(note.parentId) : null;
			const name = note.name.endsWith(".md") ? note.name : `${note.name}.md`;
			return `${parentPath ?? ""}/${name}`;
		}),
	);
	const existingJournalDates = new Set(existingJournalEntries.map((entry) => entry.dateKey));
	const existingJournalTagNames = new Set(existingJournalTags.map((tag) => tag.name));

	const manifestFolders = resolveManifestFolders(archive);
	const exportFolderPathSet = new Set(exportFolderPaths(manifestFolders).values());

	let foldersToCreate = 0;
	let foldersToSkip = 0;
	for (const path of exportFolderPathSet) {
		if (existingFolderPathSet.has(path)) {
			foldersToSkip++;
		} else {
			foldersToCreate++;
		}
	}

	let notesToCreate = 0;
	let notesToSkip = 0;
	const notesToCreateSamples: string[] = [];

	for (const note of archive.notes) {
		if (note.id && existingNoteIds.has(note.id)) {
			notesToSkip++;
			continue;
		}

		const normalizedName = note.name.endsWith(".md") ? note.name : `${note.name}.md`;
		const noteKey = `${note.parentPath ?? ""}/${normalizedName}`;
		if (existingNoteKeys.has(noteKey)) {
			notesToSkip++;
			continue;
		}

		notesToCreate++;
		if (notesToCreateSamples.length < 5) {
			notesToCreateSamples.push(noteKey.replace(/^\//, "") || normalizedName);
		}
	}

	let journalToCreate = 0;
	let journalToSkip = 0;
	const journalToCreateSamples: string[] = [];

	for (const entry of archive.journalEntries) {
		if (existingJournalDates.has(entry.dateKey)) {
			journalToSkip++;
			continue;
		}
		journalToCreate++;
		if (journalToCreateSamples.length < 5) {
			journalToCreateSamples.push(entry.dateKey);
		}
	}

	const exportTags =
		archive.manifest.version === 2
			? (archive.manifest as SkriuwExportManifestV2).journalTags
			: [];
	const uniqueExportTags = new Map<string, { name: string; color: string }>();
	for (const tag of exportTags) {
		uniqueExportTags.set(tag.name, tag);
	}
	for (const entry of archive.journalEntries) {
		for (const tag of entry.tags) {
			if (!uniqueExportTags.has(tag)) {
				uniqueExportTags.set(tag, { name: tag, color: "#64748b" });
			}
		}
	}

	let journalTagsToCreate = 0;
	let journalTagsToSkip = 0;
	for (const tag of uniqueExportTags.values()) {
		if (existingJournalTagNames.has(tag.name)) {
			journalTagsToSkip++;
		} else {
			journalTagsToCreate++;
		}
	}

	const warnings: string[] = [];
	if (archive.manifest.version === 1) {
		warnings.push("Legacy v1 export detected. Folder structure was inferred from note paths.");
	}
	if (notesToSkip > 0) {
		warnings.push(`${notesToSkip} notes already exist and will be skipped.`);
	}
	if (journalToSkip > 0) {
		warnings.push(`${journalToSkip} journal entries already exist and will be skipped.`);
	}

	return {
		folders: { create: foldersToCreate, skip: foldersToSkip },
		notes: { create: notesToCreate, skip: notesToSkip },
		journalEntries: { create: journalToCreate, skip: journalToSkip },
		journalTags: { create: journalTagsToCreate, skip: journalTagsToSkip },
		warnings,
		samples: {
			notesToCreate: notesToCreateSamples,
			journalToCreate: journalToCreateSamples,
		},
	};
}

export { resolveManifestFolders, sortFoldersForCreation, exportFolderPaths };
