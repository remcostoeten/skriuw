import { getDb } from "@/data/drizzle/client";
import { getNoteByIdDb } from "@/data/drizzle/note-storage";

import type { Note } from "../../types";

export async function getNote(id: string): Promise<Note | undefined> {
	try {
		const db = await getDb();
		return await getNoteByIdDb(db, id);
	} catch (error) {
		throw new Error(`Failed to get note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

