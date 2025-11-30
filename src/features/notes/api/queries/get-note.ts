import { getDb } from "@/api/db/db";
import { getNoteById } from "@/api/db/note-storage";

import type { Note } from "../../types";

export async function getNote(id: string): Promise<Note | undefined> {
	try {
		const db = await getDb();
		return await getNoteById(db, id);
	} catch (error) {
		throw new Error(`Failed to get note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

