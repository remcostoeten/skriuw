import { getDb } from "@/api/db/db";
import { getNotesByFolder } from "@/api/db/note-storage";

import type { Note } from "../../types";

export interface GetNotesOptions {
	parentFolderId?: string;
}

export async function getNotes(options?: GetNotesOptions): Promise<Note[]> {
	try {
		const db = await getDb();
		return await getNotesByFolder(db, options?.parentFolderId);
	} catch (error) {
		throw new Error(`Failed to get notes: ${error instanceof Error ? error.message : String(error)}`);
	}
}

