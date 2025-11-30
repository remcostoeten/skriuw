import { getDb } from "@/data/drizzle/client";
import { updateNoteRecordDb } from "@/data/drizzle/note-storage";

import type { Note, UpdateNoteData } from "../../types";

export async function updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
	try {
		const db = await getDb();
		return await updateNoteRecordDb(db, id, {
			name: data.name,
			content: data.content,
			parentFolderId: data.parentFolderId,
		});
	} catch (error) {
		throw new Error(`Failed to update note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

