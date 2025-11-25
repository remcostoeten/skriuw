import { update } from "@/api/storage/crud/update";

import type { Item } from "../../types";

const STORAGE_KEY = "Skriuw_notes";

export async function renameItem(id: string, newName: string): Promise<Item | undefined> {
	const updateFn = update;
	try {
		const result = await updateFn(STORAGE_KEY, id, { name: newName });
		return result;
	} catch (error) {
		throw new Error(`Failed to rename item: ${error instanceof Error ? error.message : String(error)}`);
	}
}

