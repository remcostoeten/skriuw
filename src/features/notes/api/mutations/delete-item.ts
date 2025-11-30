import { getDb } from "@/api/db/db";
import { deleteItemRecord } from "@/api/db/note-storage";

export async function deleteItem(id: string): Promise<boolean> {
	try {
		const db = await getDb();
		return await deleteItemRecord(db, id);
	} catch (error) {
		throw new Error(`Failed to delete item: ${error instanceof Error ? error.message : String(error)}`);
	}
}

