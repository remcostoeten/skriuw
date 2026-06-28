import { extractNoteTags } from "@/domain/notes/note-links";
import {
	buildMarkdownImportArchive,
	inferImportFolders,
} from "@/domain/data-transfer/adapters/markdown-import-shared";
import { normalizeNoteFileName, safeArchiveName } from "@/domain/data-transfer/paths";
import type { ParsedArchive, ParsedNoteFile } from "@/domain/data-transfer/types";

export { inferImportFolders as inferSimplenoteFolders };

const MAX_TITLE_LENGTH = 100;

type SimplenoteNote = {
	id?: string;
	content?: string;
	creationDate?: string;
	lastModified?: string;
	tags?: string[];
	markdown?: boolean;
	pinned?: boolean;
};

type SimplenoteExport = {
	activeNotes?: SimplenoteNote[];
	trashedNotes?: SimplenoteNote[];
};

function findNotesJson(entries: Record<string, string>): string | null {
	const path = Object.keys(entries).find((candidate) =>
		candidate.toLowerCase().endsWith("notes.json"),
	);
	return path ? entries[path] : null;
}

export function isSimplenoteArchive(entries: Record<string, string>): boolean {
	const raw = findNotesJson(entries);
	if (!raw) return false;
	try {
		const parsed = JSON.parse(raw) as SimplenoteExport;
		return Array.isArray(parsed.activeNotes) || Array.isArray(parsed.trashedNotes);
	} catch {
		return false;
	}
}

function deriveTitle(content: string): string {
	const firstLine = content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	const title = safeArchiveName(firstLine ?? "").slice(0, MAX_TITLE_LENGTH).trim();
	return title || "untitled";
}

function uniqueName(usedKeys: Set<string>, parentPath: string | null, title: string): string {
	const base = parentPath ?? "";
	let candidate = title;
	let index = 2;
	while (usedKeys.has(`${base}/${normalizeNoteFileName(candidate)}`)) {
		candidate = `${title} (${index})`;
		index += 1;
	}
	usedKeys.add(`${base}/${normalizeNoteFileName(candidate)}`);
	return candidate;
}

function toParsedNote(
	note: SimplenoteNote,
	deleted: boolean,
	usedKeys: Set<string>,
	sourcePath: string,
): ParsedNoteFile {
	const content = (note.content ?? "").replace(/\r\n/g, "\n");
	const title = deriveTitle(content);
	const name = normalizeNoteFileName(uniqueName(usedKeys, null, title));
	const declaredTags = Array.isArray(note.tags) ? note.tags : [];
	const tags = [...new Set([...declaredTags, ...extractNoteTags(content)])];

	return {
		id: note.id,
		name,
		content,
		tags,
		parentPath: null,
		preferredEditorMode: note.markdown ? "block" : "raw",
		createdAt: note.creationDate,
		updatedAt: note.lastModified,
		deleted,
		sourcePath,
	};
}

export function parseSimplenoteEntries(entries: Record<string, string>): ParsedArchive {
	const raw = findNotesJson(entries);
	if (!raw) {
		throw new Error("Simplenote export is missing source/notes.json.");
	}

	let parsed: SimplenoteExport;
	try {
		parsed = JSON.parse(raw) as SimplenoteExport;
	} catch {
		throw new Error("Simplenote notes.json could not be parsed.");
	}

	const usedKeys = new Set<string>();
	const notes: ParsedNoteFile[] = [];

	for (const note of parsed.activeNotes ?? []) {
		notes.push(toParsedNote(note, false, usedKeys, "source/notes.json#activeNotes"));
	}
	for (const note of parsed.trashedNotes ?? []) {
		notes.push(toParsedNote(note, true, usedKeys, "source/notes.json#trashedNotes"));
	}

	const trashedCount = parsed.trashedNotes?.length ?? 0;
	const warnings = [
		"Imported from Simplenote export (source/notes.json).",
		"Note titles were derived from the first line of each note; duplicate titles were numbered.",
		"Simplenote tags were mapped to note tags.",
	];
	if (trashedCount > 0) {
		warnings.push(`${trashedCount} trashed notes were imported straight into the Trash.`);
	}

	return buildMarkdownImportArchive(notes, "simplenote", warnings);
}
