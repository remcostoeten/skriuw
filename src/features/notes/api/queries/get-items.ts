import { getDb } from "@/data/drizzle/client";
import { getNoteTreeDb } from "@/data/drizzle/note-storage";

import type { Item } from "../../types";

export async function getItems(): Promise<Item[]> {
	try {
		const db = await getDb();
		return await getNoteTreeDb(db);
	} catch (error) {
		throw new Error(`Failed to get items: ${error instanceof Error ? error.message : String(error)}`);
	}
}

