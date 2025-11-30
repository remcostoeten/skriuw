import { getDb } from "@/data/drizzle/client";
import { moveItemRecordDb } from "@/data/drizzle/note-storage";

export async function moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
	try {
		const db = await getDb();
		return await moveItemRecordDb(db, itemId, targetFolderId);
	} catch (error) {
		throw new Error(`Failed to move item: ${error instanceof Error ? error.message : String(error)}`);
	}
}

