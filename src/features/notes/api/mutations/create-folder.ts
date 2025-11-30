import { getDb } from "@/api/db/db";
import { createFolderRecord } from "@/api/db/note-storage";

import type { Folder, CreateFolderData } from "../../types";

export async function createFolder(data: CreateFolderData): Promise<Folder> {
	try {
		const db = await getDb();
		return await createFolderRecord(db, {
			name: data.name,
			parentFolderId: data.parentFolderId,
		});
	} catch (error) {
		throw new Error(`Failed to create folder: ${error instanceof Error ? error.message : String(error)}`);
	}
}

