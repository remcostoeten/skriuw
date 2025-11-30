import { getDb } from "@/api/db/db";
import { moveItemRecord } from "@/api/db/note-storage";

export async function moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
	try {
		const db = await getDb();
		return await moveItemRecord(db, itemId, targetFolderId);
	} catch (error) {
		throw new Error(`Failed to move item: ${error instanceof Error ? error.message : String(error)}`);
	}
}

