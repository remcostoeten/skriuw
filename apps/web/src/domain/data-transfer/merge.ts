import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { resolveRichDocument } from "@/domain/notes/rich-document";
import type { RichTextDocument } from "@/types/notes";
import { exportFolderPaths } from "@/domain/data-transfer/folders";
import { noteImportKey } from "@/domain/data-transfer/paths";
import {
	buildImportPreview,
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
import { hardClearUserWorkspace } from "@/domain/data-transfer/workspace-clear";

type FolderRow = { id: string; name: string; parentId: string | null; sortOrder: number };

function duplicateNoteName(name: string, parentPath: string | null, existingKeys: Set<string>): string {
	const normalized = name.endsWith(".md") ? name : `${name}.md`;
	const base = normalized.slice(0, -3);
	let index = 2;
	let candidate = `${base} (${index}).md`;
	while (existingKeys.has(noteImportKey({ name: candidate, parentPath }))) {
		index++;
		candidate = `${base} (${index}).md`;
	}
	return candidate;
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
	createdAt?: Date;
	updatedAt?: Date;
	deletedAt?: Date;
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
		...(note.createdAt ? { createdAt: new Date(note.createdAt) } : {}),
		...(note.updatedAt ? { updatedAt: new Date(note.updatedAt) } : {}),
		...(note.deleted ? { deletedAt: new Date() } : {}),
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
		await hardClearUserWorkspace(prisma, userId);
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
		const folderPathToId = exportFolderPaths(folderRows);
		const pathToFolderId = new Map<string, string>(
			Array.from(folderPathToId.entries()).map(([id, path]) => [path, id]),
		);
		const existingNoteIds = new Set(existingNotes.map((note) => note.id));
		const allUserNoteIds = new Set(
			(
				await tx.note.findMany({
					where: { userId },
					select: { id: true },
				})
			).map((note) => note.id),
		);
		const existingNoteKeys = new Set<string>();
		const existingNoteIdByKey = new Map<string, string>();
		const journalDateToId = new Map(
			existingJournalEntries.map((entry) => [entry.dateKey, entry.id]),
		);
		const existingJournalDates = new Set(existingJournalEntries.map((entry) => entry.dateKey));
		const allUserJournalEntryIds = new Set(
			(
				await tx.journalEntry.findMany({
					where: { userId },
					select: { id: true },
				})
			).map((entry) => entry.id),
		);
		const softDeletedJournalByDate = new Map(
			(
				await tx.journalEntry.findMany({
					where: { userId, deletedAt: { not: null } },
					select: { id: true, dateKey: true },
				})
			).map((entry) => [entry.dateKey, entry.id]),
		);
		const journalTagIdByName = new Map(existingJournalTags.map((tag) => [tag.name, tag.id]));

		for (const note of existingNotes) {
			const parentPath = note.parentId ? folderPathToId.get(note.parentId) : null;
			const key = noteImportKey({
				name: note.name,
				parentPath: parentPath ?? null,
			});
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
			const key = noteImportKey(note);
			const parentId = note.parentPath ? (pathToFolderId.get(note.parentPath) ?? null) : null;
			const data = noteWriteData(note, parentId);

			const activeById = note.id ? existingNoteIds.has(note.id) : false;
			const activeByPath = existingNoteKeys.has(key);
			const softDeletedById =
				note.id && allUserNoteIds.has(note.id) && !activeById ? note.id : null;

			if ((activeById || activeByPath) && policy === "duplicate") {
				const duplicateName = duplicateNoteName(note.name, note.parentPath, existingNoteKeys);
				const duplicateId =
					note.id && !allUserNoteIds.has(note.id) ? note.id : crypto.randomUUID();
				await tx.note.create({
					data: {
						id: duplicateId,
						userId,
						...data,
						name: duplicateName,
					},
				});
				const duplicateKey = noteImportKey({ name: duplicateName, parentPath: note.parentPath });
				existingNoteKeys.add(duplicateKey);
				existingNoteIds.add(duplicateId);
				allUserNoteIds.add(duplicateId);
				existingNoteIdByKey.set(duplicateKey, duplicateId);
				if (note.id) {
					importedArchiveNoteIds.add(note.id);
					archiveNoteIdToWorkspaceId.set(note.id, duplicateId);
				}
				continue;
			}

			if (activeById && policy === "overwrite") {
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

			if (activeByPath && policy === "overwrite") {
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

			if (activeById || activeByPath) continue;

			if (softDeletedById) {
				await tx.note.update({
					where: { id: softDeletedById },
					data: {
						...data,
						deletedAt: null,
					},
				});
				existingNoteKeys.add(key);
				existingNoteIds.add(softDeletedById);
				existingNoteIdByKey.set(key, softDeletedById);
				if (note.id) {
					importedArchiveNoteIds.add(note.id);
					archiveNoteIdToWorkspaceId.set(note.id, softDeletedById);
				}
				continue;
			}

			const createdId =
				note.id && !allUserNoteIds.has(note.id) ? note.id : crypto.randomUUID();
			await tx.note.create({
				data: {
					id: createdId,
					userId,
					...data,
				},
			});

			existingNoteKeys.add(key);
			existingNoteIds.add(createdId);
			allUserNoteIds.add(createdId);
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

			const softDeletedJournalId = softDeletedJournalByDate.get(entry.dateKey);
			if (softDeletedJournalId) {
				await tx.journalEntry.update({
					where: { id: softDeletedJournalId },
					data: {
						content: entry.content,
						mood: entry.mood ?? null,
						tags: entry.tags,
						deletedAt: null,
					},
				});
				existingJournalDates.add(entry.dateKey);
				journalDateToId.set(entry.dateKey, softDeletedJournalId);
				continue;
			}

			const journalEntryId =
				entry.id && !allUserJournalEntryIds.has(entry.id)
					? entry.id
					: crypto.randomUUID();
			await tx.journalEntry.create({
				data: {
					id: journalEntryId,
					userId,
					dateKey: entry.dateKey,
					content: entry.content,
					mood: entry.mood ?? null,
					tags: entry.tags,
				},
			});
			existingJournalDates.add(entry.dateKey);
			allUserJournalEntryIds.add(journalEntryId);
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
