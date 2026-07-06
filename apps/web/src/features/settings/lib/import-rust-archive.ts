import type { NoteFile } from "@/domain/notes/models";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import type { WorkspaceBackend } from "@/core/workspace-backend";
import { tauriInvoke } from "@/core/workspace-backend";

type ExportedNote = {
	id: string;
	name: string;
	content: string;
	created_at: string;
	modified_at: string;
	tags?: string[];
};

export type RustArchiveValidation = {
	archive: { notes_count: number; folders_count: number; tags_count: number };
	import_summary: {
		importable: number;
		duplicates: number;
		errors: string[];
	};
	notes: ExportedNote[];
};

function toDate(value: string, fallback: Date): Date {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toNoteFile(note: ExportedNote, sortOrder: number): NoteFile {
	const createdAt = toDate(note.created_at, new Date());
	const modifiedAt = toDate(note.modified_at, createdAt);
	return {
		id: note.id,
		name: note.name,
		content: note.content,
		richContent: markdownToRichDocument(note.content),
		preferredEditorMode: "raw",
		createdAt,
		modifiedAt,
		parentId: null,
		sortOrder,
		tags: note.tags ?? [],
	};
}

export async function validateRustArchive(
	zipPath: string,
	existingNoteNames: string[],
): Promise<RustArchiveValidation> {
	return tauriInvoke<RustArchiveValidation>("extract_and_validate_archive", {
		zip_path: zipPath,
		existing_note_names: existingNoteNames,
	});
}

/**
 * Bulk-writes the notes carried by a Skriuw ZIP archive into the local vault,
 * preserving their original timestamps via `WorkspaceBackend.importNotes`.
 * Duplicate notes (by name, resolved server-side during validation) are
 * already excluded from `validation.notes`.
 */
export async function importRustArchive(
	validation: RustArchiveValidation,
	backend: WorkspaceBackend,
): Promise<number> {
	if (!backend.importNotes) {
		throw new Error("This backend cannot import notes.");
	}

	const notes = validation.notes.map((note, index) => toNoteFile(note, index));

	const batchSize = 10;
	for (let index = 0; index < notes.length; index += batchSize) {
		await backend.importNotes(notes.slice(index, index + batchSize));
	}

	return notes.length;
}
