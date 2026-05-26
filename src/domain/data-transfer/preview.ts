import type { PrismaClient } from "@/generated/prisma/client";
import {
	exportFolderPaths,
	foldersFromNotePaths,
	sortFoldersForCreation,
} from "@/domain/data-transfer/folders";
import { noteImportKey } from "@/domain/data-transfer/paths";
import type {
	ImportPolicy,
	ImportPreview,
	ParsedArchive,
	ParsedJournalFile,
	ParsedNoteFile,
	SkriuwExportFolder,
} from "@/domain/data-transfer/types";
import { DEFAULT_IMPORT_POLICY, isSkriuwManifestV2OrV3 } from "@/domain/data-transfer/types";
import { countUserWorkspace } from "@/domain/data-transfer/workspace-clear";

type NoteAction = "create" | "skip" | "overwrite";

type PreviewContext = {
	existingFolderPathSet: Set<string>;
	existingNoteIds: Set<string>;
	existingNoteKeys: Set<string>;
	existingNoteIdByKey: Map<string, string>;
	existingJournalDates: Set<string>;
	existingJournalTagNames: Set<string>;
	existingVersionIds: Set<string>;
};

function emptyCounts() {
	return { create: 0, skip: 0, overwrite: 0 };
}

function classifyNote(note: ParsedNoteFile, ctx: PreviewContext, policy: ImportPolicy): NoteAction {
	if (policy === "replace-workspace") return "create";

	const key = noteImportKey(note);
	if (note.id && ctx.existingNoteIds.has(note.id)) {
		return policy === "overwrite" ? "overwrite" : "skip";
	}
	if (ctx.existingNoteKeys.has(key)) {
		return policy === "overwrite" ? "overwrite" : "skip";
	}
	return "create";
}

function classifyJournal(
	entry: ParsedJournalFile,
	ctx: PreviewContext,
	policy: ImportPolicy,
): NoteAction {
	if (policy === "replace-workspace") return "create";
	if (ctx.existingJournalDates.has(entry.dateKey)) {
		return policy === "overwrite" ? "overwrite" : "skip";
	}
	return "create";
}

export function resolveManifestFolders(archive: ParsedArchive): SkriuwExportFolder[] {
	if (isSkriuwManifestV2OrV3(archive.manifest)) {
		return archive.manifest.folders;
	}
	return foldersFromNotePaths(archive.notes);
}

export async function buildImportPreview(
	prisma: PrismaClient,
	userId: string,
	archive: ParsedArchive,
	policy: ImportPolicy = DEFAULT_IMPORT_POLICY,
): Promise<ImportPreview> {
	const [
		existingFolders,
		existingNotes,
		existingJournalEntries,
		existingJournalTags,
		existingVersions,
	] = await Promise.all([
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
		prisma.noteVersion.findMany({
			where: { userId },
			select: { id: true },
		}),
	]);

	const existingFolderPaths = exportFolderPaths(existingFolders);
	const ctx: PreviewContext = {
		existingFolderPathSet: new Set(existingFolderPaths.values()),
		existingNoteIds: new Set(existingNotes.map((note) => note.id)),
		existingNoteKeys: new Set(),
		existingNoteIdByKey: new Map(),
		existingJournalDates: new Set(existingJournalEntries.map((entry) => entry.dateKey)),
		existingJournalTagNames: new Set(existingJournalTags.map((tag) => tag.name)),
		existingVersionIds: new Set(existingVersions.map((version) => version.id)),
	};

	for (const note of existingNotes) {
		const parentPath = note.parentId ? existingFolderPaths.get(note.parentId) : null;
		const key = noteImportKey({
			name: note.name,
			parentPath: parentPath ?? null,
		});
		ctx.existingNoteKeys.add(key);
		ctx.existingNoteIdByKey.set(key, note.id);
	}

	const folderCounts = emptyCounts();
	const manifestFolders = resolveManifestFolders(archive);
	const exportFolderPathSet = new Set(exportFolderPaths(manifestFolders).values());

	for (const path of exportFolderPathSet) {
		if (policy === "replace-workspace" || !ctx.existingFolderPathSet.has(path)) {
			folderCounts.create++;
		} else {
			folderCounts.skip++;
		}
	}

	const noteCounts = emptyCounts();
	const notesToCreateSamples: string[] = [];
	const notesToOverwriteSamples: string[] = [];
	const noteActions = new Map<ParsedNoteFile, NoteAction>();

	for (const note of archive.notes) {
		const action = classifyNote(note, ctx, policy);
		noteActions.set(note, action);
		noteCounts[action]++;
		const sampleKey = noteImportKey(note).replace(/^\//, "") || note.name;
		if (action === "create" && notesToCreateSamples.length < 5) {
			notesToCreateSamples.push(sampleKey);
		}
		if (action === "overwrite" && notesToOverwriteSamples.length < 5) {
			notesToOverwriteSamples.push(sampleKey);
		}
	}

	const journalCounts = emptyCounts();
	const journalToCreateSamples: string[] = [];
	const journalToOverwriteSamples: string[] = [];

	for (const entry of archive.journalEntries) {
		const action = classifyJournal(entry, ctx, policy);
		journalCounts[action]++;
		if (action === "create" && journalToCreateSamples.length < 5) {
			journalToCreateSamples.push(entry.dateKey);
		}
		if (action === "overwrite" && journalToOverwriteSamples.length < 5) {
			journalToOverwriteSamples.push(entry.dateKey);
		}
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

	const journalTagCounts = emptyCounts();
	for (const tag of uniqueExportTags.values()) {
		if (policy === "replace-workspace" || !ctx.existingJournalTagNames.has(tag.name)) {
			journalTagCounts.create++;
		} else if (policy === "overwrite") {
			journalTagCounts.overwrite++;
		} else {
			journalTagCounts.skip++;
		}
	}

	const versionCounts = emptyCounts();
	const importedNoteIds = new Set(
		archive.notes.map((note) => note.id).filter((id): id is string => Boolean(id)),
	);

	for (const version of archive.noteVersions) {
		if (!importedNoteIds.has(version.noteId)) {
			versionCounts.skip++;
			continue;
		}

		const sourceNote = archive.notes.find((note) => note.id === version.noteId);
		if (!sourceNote) {
			versionCounts.skip++;
			continue;
		}

		const noteAction = noteActions.get(sourceNote) ?? "skip";
		if (noteAction === "skip") {
			versionCounts.skip++;
			continue;
		}
		if (ctx.existingVersionIds.has(version.id)) {
			versionCounts.skip++;
			continue;
		}
		versionCounts.create++;
	}

	const warnings: string[] = [...archive.integrityWarnings];
	if (archive.manifest.version === 1 && archive.profile === "skriuw") {
		warnings.push("Legacy v1 export detected. Folder structure was inferred from note paths.");
	}
	if (policy === "merge") {
		if (noteCounts.skip > 0) {
			warnings.push(`${noteCounts.skip} notes already exist and will be skipped.`);
		}
		if (journalCounts.skip > 0) {
			warnings.push(`${journalCounts.skip} journal entries already exist and will be skipped.`);
		}
	}
	if (policy === "overwrite") {
		if (noteCounts.overwrite > 0) {
			warnings.push(`${noteCounts.overwrite} existing notes will be overwritten.`);
		}
		if (journalCounts.overwrite > 0) {
			warnings.push(`${journalCounts.overwrite} existing journal entries will be overwritten.`);
		}
	}

	let replaceWorkspace: ImportPreview["replaceWorkspace"];
	if (policy === "replace-workspace") {
		replaceWorkspace = await countUserWorkspace(prisma, userId);
		warnings.push(
			`This will remove ${replaceWorkspace.notes} notes, ${replaceWorkspace.folders} folders, ${replaceWorkspace.journalEntries} journal entries, and ${replaceWorkspace.journalTags} journal tags before importing.`,
		);
	}

	return {
		policy,
		profile: archive.profile,
		folders: folderCounts,
		notes: noteCounts,
		journalEntries: journalCounts,
		journalTags: journalTagCounts,
		noteVersions: versionCounts,
		warnings,
		integrityWarnings: archive.integrityWarnings,
		replaceWorkspace,
		samples: {
			notesToCreate: notesToCreateSamples,
			notesToOverwrite: notesToOverwriteSamples,
			journalToCreate: journalToCreateSamples,
			journalToOverwrite: journalToOverwriteSamples,
		},
	};
}

export { sortFoldersForCreation, exportFolderPaths };
