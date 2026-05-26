import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { resolveRichDocument } from "@/domain/notes/rich-document";
import type { RichTextDocument } from "@/types/notes";
import {
	buildImportPreview,
	exportFolderPaths,
	resolveManifestFolders,
	sortFoldersForCreation,
} from "@/domain/data-transfer/preview";
import type {
	ImportMergeResult,
	ImportPolicy,
	ParsedArchive,
	ParsedNoteFile,
} from "@/domain/data-transfer/types";
import { DEFAULT_IMPORT_POLICY, isSkriuwManifestV2OrV3 } from "@/domain/data-transfer/types";
import { softClearUserWorkspace } from "@/domain/data-transfer/workspace-clear";

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

function noteKey(note: ParsedNoteFile): string {
	const normalizedName = note.name.endsWith(".md") ? note.name : `${note.name}.md`;
	return `${note.parentPath ?? ""}/${normalizedName}`;
}

function noteWriteData(
	note: ParsedNoteFile,
	parentId: string | null,
): {
	name: string;
	content: string;
	richContent: Prisma.InputJsonValue;
	preferredEditorMode: string;
	parentId: string | null;
	sortOrder: number;
	tags: string[];
} {
	const preferredEditorMode = note.preferredEditorMode ?? "block";
	const richContent = resolveRichDocument(
		note.content,
		note.richContent as RichTextDocument | null | undefined,
	) as Prisma.InputJsonValue;

	return {
		name: note.name.endsWith(".md") ? note.name : `${note.name}.md`,
		content: note.content,
		richContent,
		preferredEditorMode,
		parentId,
		sortOrder: note.sortOrder ?? 0,
		tags: note.tags,
	};
}

export async function mergeArchiveImport(
	prisma: PrismaClient,
	userId: string,
	archive: ParsedArchive,
	policy: ImportPolicy = DEFAULT_IMPORT_POLICY,
): Promise<ImportMergeResult> {
	const preview = await buildImportPreview(prisma, userId, archive, policy);

	if (policy === "replace-workspace") {
		await softClearUserWorkspace(prisma, userId);
	}

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
			select: { id: true, dateKey: true },
		});
		const existingJournalTags = await tx.journalTag.findMany({
			where: { userId, deletedAt: null },
			select: { id: true, name: true },
		});
		const existingVersionIds = new Set(
			(
				await tx.noteVersion.findMany({
					where: { userId },
					select: { id: true },
				})
			).map((version) => version.id),
		);

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
		const existingNoteKeys = new Set<string>();
		const existingNoteIdByKey = new Map<string, string>();
		const journalDateToId = new Map(
			existingJournalEntries.map((entry) => [entry.dateKey, entry.id]),
		);
		const existingJournalDates = new Set(existingJournalEntries.map((entry) => entry.dateKey));
		const journalTagIdByName = new Map(existingJournalTags.map((tag) => [tag.name, tag.id]));

		for (const note of existingNotes) {
			const parentPath = note.parentId ? folderPathToId.get(note.parentId) : null;
			const name = note.name.endsWith(".md") ? note.name : `${note.name}.md`;
			const key = `${parentPath ?? ""}/${name}`;
			existingNoteKeys.add(key);
			existingNoteIdByKey.set(key, note.id);
		}

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

		const importedArchiveNoteIds = new Set<string>();
		const archiveNoteIdToWorkspaceId = new Map<string, string>();

		for (const note of archive.notes) {
			const key = noteKey(note);
			const parentId = note.parentPath ? (pathToFolderId.get(note.parentPath) ?? null) : null;
			const data = noteWriteData(note, parentId);

			const overwriteById = note.id && existingNoteIds.has(note.id);
			const overwriteByPath = existingNoteKeys.has(key);

			if (overwriteById && policy === "overwrite") {
				await tx.note.updateMany({
					where: { id: note.id, userId, deletedAt: null },
					data,
				});
				if (note.id) {
					importedArchiveNoteIds.add(note.id);
					archiveNoteIdToWorkspaceId.set(note.id, note.id);
				}
				continue;
			}

			if (overwriteByPath && policy === "overwrite") {
				const existingId = existingNoteIdByKey.get(key);
				if (existingId) {
					await tx.note.updateMany({
						where: { id: existingId, userId, deletedAt: null },
						data,
					});
					if (note.id) {
						importedArchiveNoteIds.add(note.id);
						archiveNoteIdToWorkspaceId.set(note.id, existingId);
					}
				}
				continue;
			}

			if (overwriteById || overwriteByPath) continue;

			const createdId =
				note.id && !existingNoteIds.has(note.id) ? note.id : crypto.randomUUID();
			await tx.note.create({
				data: {
					id: createdId,
					userId,
					...data,
				},
			});

			existingNoteKeys.add(key);
			existingNoteIds.add(createdId);
			existingNoteIdByKey.set(key, createdId);
			if (note.id) {
				importedArchiveNoteIds.add(note.id);
				archiveNoteIdToWorkspaceId.set(note.id, createdId);
			}
		}

		for (const entry of archive.journalEntries) {
			if (existingJournalDates.has(entry.dateKey)) {
				if (policy !== "overwrite") continue;
				const existingId = journalDateToId.get(entry.dateKey);
				if (!existingId) continue;
				await tx.journalEntry.updateMany({
					where: { id: existingId, userId, deletedAt: null },
					data: {
						content: entry.content,
						mood: entry.mood ?? null,
						tags: entry.tags,
					},
				});
				continue;
			}

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

		const exportTags = isSkriuwManifestV2OrV3(archive.manifest)
			? archive.manifest.journalTags
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
			const existingId = journalTagIdByName.get(tag.name);
			if (existingId) {
				if (policy === "overwrite") {
					await tx.journalTag.updateMany({
						where: { id: existingId, userId, deletedAt: null },
						data: { color: tag.color },
					});
				}
				continue;
			}

			await tx.journalTag.create({
				data: {
					userId,
					name: tag.name,
					color: tag.color,
				},
			});
		}

		for (const version of archive.noteVersions) {
			if (!importedArchiveNoteIds.has(version.noteId)) continue;
			if (existingVersionIds.has(version.id)) continue;

			const workspaceNoteId = archiveNoteIdToWorkspaceId.get(version.noteId);
			if (!workspaceNoteId) continue;

			await tx.noteVersion.create({
				data: {
					id: version.id,
					userId,
					noteId: workspaceNoteId,
					name: version.name,
					content: version.content,
					richContent: (version.richContent ??
						resolveRichDocument(version.content, null)) as Prisma.InputJsonValue,
					preferredEditorMode: version.preferredEditorMode,
					parentId: version.parentId,
					tags: version.tags,
					reason: version.reason,
					contentHash: version.contentHash,
					createdAt: new Date(version.createdAt),
				},
			});
		}
	});

	return { ok: true, ...preview };
}
