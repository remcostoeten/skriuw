import { getDb } from "@/api/db/db";
import { createNoteRecord } from "@/api/db/note-storage";

import type { Note, CreateNoteData } from "../../types";

export async function createNote(data: CreateNoteData): Promise<Note> {
	try {
		const db = await getDb();
		return await createNoteRecord(db, {
			name: data.name,
			content: data.content,
			parentFolderId: data.parentFolderId,
		});
	} catch (error) {
		throw new Error(`Failed to create note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

