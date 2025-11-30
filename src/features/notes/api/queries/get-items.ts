import { getDb } from "@/api/db/db";
import { getNoteTree } from "@/api/db/note-storage";

import type { Item } from "../../types";

export async function getItems(): Promise<Item[]> {
	try {
		const db = await getDb();
		return await getNoteTree(db);
	} catch (error) {
		throw new Error(`Failed to get items: ${error instanceof Error ? error.message : String(error)}`);
	}
}

