import { getDb } from "@/data/drizzle/client";
import { createNoteRecordDb } from "@/data/drizzle/note-storage";

import type { Note, CreateNoteData } from "../../types";

export async function createNote(data: CreateNoteData): Promise<Note> {
	try {
		const db = await getDb();
		return await createNoteRecordDb(db, {
			name: data.name,
			content: data.content,
			parentFolderId: data.parentFolderId,
		});
	} catch (error) {
		throw new Error(`Failed to create note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

