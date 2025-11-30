import { getDb } from "@/data/drizzle/client";
import { createFolderRecordDb } from "@/data/drizzle/note-storage";

import type { Folder, CreateFolderData } from "../../types";

export async function createFolder(data: CreateFolderData): Promise<Folder> {
	try {
		const db = await getDb();
		return await createFolderRecordDb(db, {
			name: data.name,
			parentFolderId: data.parentFolderId,
		});
	} catch (error) {
		throw new Error(`Failed to create folder: ${error instanceof Error ? error.message : String(error)}`);
	}
}

