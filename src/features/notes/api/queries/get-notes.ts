import { getDb } from "@/data/drizzle/client";
import { getNotesByFolderDb } from "@/data/drizzle/note-storage";

import type { Note } from "../../types";

export interface GetNotesOptions {
	parentFolderId?: string;
}

export async function getNotes(options?: GetNotesOptions): Promise<Note[]> {
	try {
		const db = await getDb();
		return await getNotesByFolderDb(db, options?.parentFolderId);
	} catch (error) {
		throw new Error(`Failed to get notes: ${error instanceof Error ? error.message : String(error)}`);
	}
}

