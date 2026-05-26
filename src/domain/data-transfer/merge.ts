import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import {
	buildImportPreview,
	exportFolderPaths,
	resolveManifestFolders,
	sortFoldersForCreation,
} from "@/domain/data-transfer/preview";
import type { ImportMergeResult, ParsedArchive, SkriuwExportManifestV2 } from "@/domain/data-transfer/types";

type FolderRow = { id: string; name: string; parentId: string | null; sortOrder: number };

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

export async function mergeArchiveImport(
	prisma: PrismaClient,
	userId: string,
	archive: ParsedArchive,
): Promise<ImportMergeResult> {
	const preview = await buildImportPreview(prisma, userId, archive);

	await prisma.$transaction(async (tx) => {
		const existingFolders = await tx.folder.findMany({
			where: { userId, deletedAt: null },
			select: { id: true, name: true, parentId: true, sortOrder: true },
		});
		const existingNotes = await tx.note.findMany({
			where: { userId, deletedAt: null },
			select: { id: true, name: true, parentId: true },
		});
		const existingJournalEntries = await tx.journalEntry.findMany({
			where: { userId, deletedAt: null },
			select: { dateKey: true },
		});
		const existingJournalTags = await tx.journalTag.findMany({
			where: { userId, deletedAt: null },
			select: { name: true },
		});

		const folderRows: FolderRow[] = existingFolders.map((folder) => ({
			id: folder.id,
			name: folder.name,
			parentId: folder.parentId,
			sortOrder: folder.sortOrder,
		}));
		const folderPathToId = buildFolderPaths(folderRows);
		const pathToFolderId = new Map<string, string>(
			Array.from(folderPathToId.entries()).map(([id, path]) => [path, id]),
		);
		const existingNoteIds = new Set(existingNotes.map((note) => note.id));
		const existingNoteKeys = new Set(
			existingNotes.map((note) => {
				const parentPath = note.parentId ? folderPathToId.get(note.parentId) : null;
				const name = note.name.endsWith(".md") ? note.name : `${note.name}.md`;
				return `${parentPath ?? ""}/${name}`;
			}),
		);
		const existingJournalDates = new Set(existingJournalEntries.map((entry) => entry.dateKey));
		const existingJournalTagNames = new Set(existingJournalTags.map((tag) => tag.name));

		const exportFolders = sortFoldersForCreation(resolveManifestFolders(archive));
		const exportPathById = exportFolderPaths(exportFolders);

		for (const folder of exportFolders) {
			const path = exportPathById.get(folder.id);
			if (!path || pathToFolderId.has(path)) continue;

			const parentPath = folder.parentId ? exportPathById.get(folder.parentId) : undefined;
			const parentId = parentPath ? (pathToFolderId.get(parentPath) ?? null) : null;
			const created = await tx.folder.create({
				data: {
					userId,
					name: folder.name,
					parentId,
					sortOrder: folder.sortOrder,
				},
				select: { id: true, name: true, parentId: true, sortOrder: true },
			});
			folderRows.push(created);
			folderPathToId.set(created.id, path);
			pathToFolderId.set(path, created.id);
		}

		for (const note of archive.notes) {
			const normalizedName = note.name.endsWith(".md") ? note.name : `${note.name}.md`;
			if (note.id && existingNoteIds.has(note.id)) continue;

			const noteKey = `${note.parentPath ?? ""}/${normalizedName}`;
			if (existingNoteKeys.has(noteKey)) continue;

			const parentId = note.parentPath ? (pathToFolderId.get(note.parentPath) ?? null) : null;
			const preferredEditorMode = note.preferredEditorMode ?? "block";
			const richContent = markdownToRichDocument(note.content) as Prisma.InputJsonValue;

			await tx.note.create({
				data: {
					id: note.id && !existingNoteIds.has(note.id) ? note.id : crypto.randomUUID(),
					userId,
					name: normalizedName,
					content: note.content,
					richContent,
					preferredEditorMode,
					parentId,
					sortOrder: note.sortOrder ?? 0,
					tags: note.tags,
				},
			});

			existingNoteKeys.add(noteKey);
			if (note.id) existingNoteIds.add(note.id);
		}

		for (const entry of archive.journalEntries) {
			if (existingJournalDates.has(entry.dateKey)) continue;

			await tx.journalEntry.create({
				data: {
					id: entry.id ?? crypto.randomUUID(),
					userId,
					dateKey: entry.dateKey,
					content: entry.content,
					mood: entry.mood ?? null,
					tags: entry.tags,
				},
			});
			existingJournalDates.add(entry.dateKey);
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

		for (const tag of uniqueExportTags.values()) {
			if (existingJournalTagNames.has(tag.name)) continue;
			await tx.journalTag.create({
				data: {
					userId,
					name: tag.name,
					color: tag.color,
				},
			});
		}
	});

	return { ok: true, ...preview };
}
