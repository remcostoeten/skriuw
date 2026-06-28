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
	total: number;
	importedNotes: NoteFile[];
};

export type SimplenoteDuplicatePolicy = "skip" | "overwrite" | "duplicate";

export type SimplenoteImportPreview = {
	total: number;
	duplicates: number;
	unique: number;
	trashed: number;
	samples: string[];
};

export type SimplenoteImportOptions = {
	duplicatePolicy?: SimplenoteDuplicatePolicy;
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

export async function previewSimplenoteFile(
	file: File,
	backend: WorkspaceBackend,
): Promise<SimplenoteImportPreview> {
	const archive = await parseSimplenoteFile(file);
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
	const archive = await parseSimplenoteFile(file);

	const existingNotes = backend.listNotes ? await backend.listNotes() : [];
	const existingIds = new Set(existingNotes.map((note) => note.id));
	const existingKeys = new Set(existingNotes.map(noteKey));
	const existingIdByKey = new Map(existingNotes.map((note) => [noteKey(note), note.id]));
	const existingRootNames = new Set(
		existingNotes.filter((note) => note.parentId === null).map((note) => note.name),
	);
	const notesToImport: NoteFile[] = [];
	const notesToOverwrite: NoteFile[] = [];
	const skippedIds = new Set<string>();
	const duplicatedIds = new Set<string>();
	const trashedIds: string[] = [];

	for (const [index, parsedNote] of archive.notes.entries()) {
		const note = toNoteFile(parsedNote, index);
		const key = noteKey(note);
		const hasIdConflict = existingIds.has(note.id);
		const existingIdForKey = existingIdByKey.get(key);
		const hasNameConflict = existingKeys.has(key);

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

			const duplicateName = duplicateNoteName(note.name, existingRootNames);
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
			existingRootNames.add(duplicate.name);
			continue;
		}

		notesToImport.push(note);
		if (parsedNote.deleted) trashedIds.push(note.id);
		existingIds.add(note.id);
		existingKeys.add(key);
		existingRootNames.add(note.name);
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
		total: archive.notes.length,
		importedNotes: [...notesToOverwrite, ...notesToImport],
	};
}
