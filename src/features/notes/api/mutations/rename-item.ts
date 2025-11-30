import { getDb } from "@/api/db/db";
import { renameItemRecord } from "@/api/db/note-storage";

import type { Item } from "../../types";

export async function renameItem(id: string, newName: string): Promise<Item | undefined> {
	try {
		const db = await getDb();
		return await renameItemRecord(db, id, newName);
	} catch (error) {
		throw new Error(`Failed to rename item: ${error instanceof Error ? error.message : String(error)}`);
	}
}

