import { read } from '@skriuw/storage/crud/read';

import type { Item } from "../../types";

const STORAGE_KEY = "Skriuw_notes";

export async function getItems(): Promise<Item[]> {
	const readFn = read;
	try {
		const result = await readFn(STORAGE_KEY, { getAll: true });
		return Array.isArray(result) ? result : [];
	} catch (error) {
		throw new Error(`Failed to get items: ${error instanceof Error ? error.message : String(error)}`);
	}
}

