import { getDb } from "@/data/drizzle/client";
import { deleteItemRecordDb } from "@/data/drizzle/note-storage";

export async function deleteItem(id: string): Promise<boolean> {
	try {
		const db = await getDb();
		return await deleteItemRecordDb(db, id);
	} catch (error) {
		throw new Error(`Failed to delete item: ${error instanceof Error ? error.message : String(error)}`);
	}
}

