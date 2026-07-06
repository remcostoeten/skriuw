import { parseSimplenoteEntries } from "@/domain/data-transfer/adapters/simplenote";
import { decodeArchiveEntries } from "@/domain/data-transfer/parse-archive";
import type { ParsedNoteFile } from "@/domain/data-transfer/types";
import type { NoteFile } from "@/domain/notes/models";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import type { WorkspaceBackend } from "@/core/workspace-backend";

export type SimplenoteImportSummary = {
	imported: number;
	trashed: number;
	skipped: number;
	overwritten: number;
	duplicated: number;
	organizedByYear: number;
	total: number;
	importedNotes: NoteFile[];
};

export type SimplenoteDuplicatePolicy = "skip" | "overwrite" | "duplicate";
export type SimplenoteOrganizationMode = "root" | "year";

export type YearBucket = {
	year: string;
	count: number;
};

export type SimplenoteImportPreview = {
	total: number;
	duplicates: number;
	unique: number;
	trashed: number;
	dated: number;
	undated: number;
	years: YearBucket[];
	samples: string[];
};

export type SimplenoteImportOptions = {
	duplicatePolicy?: SimplenoteDuplicatePolicy;
	organizationMode?: SimplenoteOrganizationMode;
	onProgress?: (imported: number, total: number) => void;
};

function toDate(value: string | undefined, fallback: Date): Date {
	if (!value) return fallback;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toNoteFile(note: ParsedNoteFile, sortOrder: number): NoteFile {
	const createdAt = toDate(note.createdAt, new Date());
	const modifiedAt = toDate(note.updatedAt, createdAt);
	return {
		id: note.id ?? crypto.randomUUID(),
		name: note.name,
		content: note.content,
		richContent: markdownToRichDocument(note.content),
		preferredEditorMode: note.preferredEditorMode ?? "raw",
		createdAt,
		modifiedAt,
		parentId: null,
		sortOrder,
		tags: note.tags,
	};
}

function noteKey(note: { name: string; parentId: string | null }): string {
	return `${note.parentId ?? ""}/${note.name.endsWith(".md") ? note.name : `${note.name}.md`}`;
}

function yearFromDate(value: string | Date | undefined): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return String(date.getFullYear());
}

function countYears(notes: ParsedNoteFile[]): {
	years: YearBucket[];
	dated: number;
	undated: number;
} {
	const counts = new Map<string, number>();
	let undated = 0;
	for (const note of notes) {
		const year = yearFromDate(note.createdAt);
		if (!year) {
			undated++;
			continue;
		}
		counts.set(year, (counts.get(year) ?? 0) + 1);
	}
	const years = Array.from(counts.entries())
		.map(([year, count]) => ({ year, count }))
		.sort((a, b) => Number(b.year) - Number(a.year));
	return { years, dated: notes.length - undated, undated };
}

function duplicateNoteName(name: string, existingNames: Set<string>): string {
	const normalized = name.endsWith(".md") ? name : `${name}.md`;
	const base = normalized.slice(0, -3);
	let index = 2;
	let candidate = `${base} (${index}).md`;
	while (existingNames.has(candidate)) {
		index++;
		candidate = `${base} (${index}).md`;
	}
	return candidate;
}

async function parseSimplenoteFile(file: File) {
	const buffer = new Uint8Array(await file.arrayBuffer());
	const entries = decodeArchiveEntries(buffer);
	return parseSimplenoteEntries(entries);
}

async function ensureYearFolders(
	backend: WorkspaceBackend,
	years: string[],
): Promise<Map<string, string>> {
	if (years.length === 0) return new Map();
	if (!backend.listFolders || !backend.createFolder) {
		throw new Error("This backend cannot organize notes into folders.");
	}

	const folders = await backend.listFolders();
	const rootFolders = folders.filter((folder) => folder.parentId === null);
	const folderIdByYear = new Map(
		rootFolders
			.filter((folder) => years.includes(folder.name))
			.map((folder) => [folder.name, folder.id]),
	);
	let sortOrder = Math.max(-1, ...rootFolders.map((folder) => folder.sortOrder ?? 0)) + 1;

	for (const year of years) {
		if (folderIdByYear.has(year)) continue;
		const folder = await backend.createFolder({
			name: year,
			parentId: null,
			sortOrder,
		});
		sortOrder++;
		folderIdByYear.set(year, folder.id);
	}

	return folderIdByYear;
}

function namesByParent(notes: NoteFile[]): Map<string, Set<string>> {
	const byParent = new Map<string, Set<string>>();
	for (const note of notes) {
		const parentKey = note.parentId ?? "";
		const names = byParent.get(parentKey) ?? new Set<string>();
		names.add(note.name.endsWith(".md") ? note.name : `${note.name}.md`);
		byParent.set(parentKey, names);
	}
	return byParent;
}

export async function previewSimplenoteFile(
	file: File,
	backend: WorkspaceBackend,
): Promise<SimplenoteImportPreview> {
	const archive = await parseSimplenoteFile(file);
	const yearCounts = countYears(archive.notes);
	const existingNotes = backend.listNotes ? await backend.listNotes() : [];
	const existingIds = new Set(existingNotes.map((note) => note.id));
	const existingKeys = new Set(existingNotes.map(noteKey));
	const duplicateNames: string[] = [];

	for (const parsedNote of archive.notes) {
		const note = toNoteFile(parsedNote, 0);
		if (existingIds.has(note.id) || existingKeys.has(noteKey(note))) {
			duplicateNames.push(note.name);
		}
	}

	return {
		total: archive.notes.length,
		duplicates: duplicateNames.length,
		unique: archive.notes.length - duplicateNames.length,
		trashed: archive.notes.filter((note) => note.deleted).length,
		dated: yearCounts.dated,
		undated: yearCounts.undated,
		years: yearCounts.years,
		samples: duplicateNames.slice(0, 5),
	};
}

/**
 * Desktop-only Simplenote import: decode the export `.zip`, parse `notes.json`
 * through the shared Simplenote adapter, bulk-write every note into the local
 * vault (preserving original timestamps), then soft-delete the notes Simplenote
 * had in its own trash so they land in the real Trash bin.
 */
export async function importSimplenoteFile(
	file: File,
	backend: WorkspaceBackend,
	options: SimplenoteImportOptions = {},
): Promise<SimplenoteImportSummary> {
	if (!backend.importNotes) {
		throw new Error("This backend cannot import notes.");
	}

	const duplicatePolicy = options.duplicatePolicy ?? "skip";
	const organizationMode = options.organizationMode ?? "root";
	const archive = await parseSimplenoteFile(file);
	const yearCounts = countYears(archive.notes);
	const folderIdByYear =
		organizationMode === "year"
			? await ensureYearFolders(
					backend,
					yearCounts.years.map((bucket) => bucket.year),
				)
			: new Map<string, string>();

	const existingNotes = backend.listNotes ? await backend.listNotes() : [];
	const existingIds = new Set(existingNotes.map((note) => note.id));
	const existingKeys = new Set(existingNotes.map(noteKey));
	const existingIdByKey = new Map(existingNotes.map((note) => [noteKey(note), note.id]));
	const existingNamesByParent = namesByParent(existingNotes);
	const notesToImport: NoteFile[] = [];
	const notesToOverwrite: NoteFile[] = [];
	const skippedIds = new Set<string>();
	const duplicatedIds = new Set<string>();
	const trashedIds: string[] = [];
	let organizedByYear = 0;

	for (const [index, parsedNote] of archive.notes.entries()) {
		const year = yearFromDate(parsedNote.createdAt);
		const parentId =
			organizationMode === "year" && year ? (folderIdByYear.get(year) ?? null) : null;
		const note = { ...toNoteFile(parsedNote, index), parentId };
		if (parentId) organizedByYear++;
		const key = noteKey(note);
		const hasIdConflict = existingIds.has(note.id);
		const existingIdForKey = existingIdByKey.get(key);
		const hasNameConflict = existingKeys.has(key);
		const parentNameKey = note.parentId ?? "";
		const existingNames = existingNamesByParent.get(parentNameKey) ?? new Set<string>();

		if (hasIdConflict || hasNameConflict) {
			if (duplicatePolicy === "skip") {
				skippedIds.add(note.id);
				continue;
			}

			if (duplicatePolicy === "overwrite") {
				const targetId = hasIdConflict ? note.id : existingIdForKey;
				if (targetId) {
					const overwritten = { ...note, id: targetId };
					notesToOverwrite.push(overwritten);
					if (parsedNote.deleted) trashedIds.push(overwritten.id);
				}
				continue;
			}

			const duplicateName = duplicateNoteName(note.name, existingNames);
			const duplicate = {
				...note,
				id: hasIdConflict ? crypto.randomUUID() : note.id,
				name: duplicateName,
			};
			duplicatedIds.add(note.id);
			notesToImport.push(duplicate);
			if (parsedNote.deleted) trashedIds.push(duplicate.id);
			existingIds.add(duplicate.id);
			existingKeys.add(noteKey(duplicate));
			existingNames.add(duplicate.name);
			existingNamesByParent.set(parentNameKey, existingNames);
			continue;
		}

		notesToImport.push(note);
		if (parsedNote.deleted) trashedIds.push(note.id);
		existingIds.add(note.id);
		existingKeys.add(key);
		existingNames.add(note.name);
		existingNamesByParent.set(parentNameKey, existingNames);
	}

	let completed = 0;
	const total = notesToImport.length + notesToOverwrite.length;
	options.onProgress?.(completed, total);
	for (const note of notesToOverwrite) {
		const result = await backend.updateNote({
			id: note.id,
			name: note.name,
			content: note.content,
			richContent: note.richContent,
			preferredEditorMode: note.preferredEditorMode,
			parentId: note.parentId,
			sortOrder: note.sortOrder,
			tags: note.tags,
			trackHeading: false,
		});
		if (result.note) {
			completed++;
			options.onProgress?.(completed, total);
		}
	}

	const batchSize = 10;
	for (let index = 0; index < notesToImport.length; index += batchSize) {
		const batch = notesToImport.slice(index, index + batchSize);
		await backend.importNotes(batch);
		completed += batch.length;
		options.onProgress?.(completed, total);
	}

	for (const id of trashedIds) {
		await backend.deleteNote(id);
	}

	return {
		imported: total,
		trashed: trashedIds.length,
		skipped: skippedIds.size,
		overwritten: notesToOverwrite.length,
		duplicated: duplicatedIds.size,
		organizedByYear,
		total: archive.notes.length,
		importedNotes: [...notesToOverwrite, ...notesToImport],
	};
}

export async function organizeWorkspaceNotesByYear(
	backend: WorkspaceBackend,
): Promise<{ moved: number; folders: number }> {
	if (!backend.listNotes || !backend.updateNote) {
		throw new Error("This backend cannot organize notes.");
	}

	const notes = await backend.listNotes();
	const candidates = notes.filter(
		(note) => note.parentId === null && yearFromDate(note.createdAt),
	);
	const years = Array.from(
		new Set(candidates.map((note) => yearFromDate(note.createdAt)).filter(Boolean) as string[]),
	).sort((a, b) => Number(b) - Number(a));
	const folderIdByYear = await ensureYearFolders(backend, years);
	let moved = 0;

	for (const note of candidates) {
		const year = yearFromDate(note.createdAt);
		const parentId = year ? folderIdByYear.get(year) : undefined;
		if (!parentId || note.parentId === parentId) continue;
		const result = await backend.updateNote({
			id: note.id,
			name: note.name,
			content: note.content,
			richContent: note.richContent,
			preferredEditorMode: note.preferredEditorMode,
			parentId,
			sortOrder: note.sortOrder,
			tags: note.tags,
			trackHeading: false,
		});
		if (result.note) moved++;
	}

	return { moved, folders: years.length };
}
