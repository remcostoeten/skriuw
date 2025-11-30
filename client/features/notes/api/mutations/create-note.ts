import { create } from "@/api/storage/crud/create";
import type { Note, CreateNoteData } from "../../types";

const STORAGE_KEY = "Skriuw_notes";

export async function createNote(data: CreateNoteData): Promise<Note> {
	const createFn = create;
	try {
		const result = await createFn(STORAGE_KEY, {
			type: 'note',
			name: data.name,
			content: data.content || [],
			parentFolderId: data.parentFolderId,
		} as any);
		return result as Note;
	} catch (error) {
		throw new Error(`Failed to create note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

