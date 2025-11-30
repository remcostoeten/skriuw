import { read } from "@/api/storage/crud/read";
import type { Note } from "../../types";

const STORAGE_KEY = "Skriuw_notes";

export async function getNote(id: string): Promise<Note | undefined> {
	try {
		const result = await read<Note>(STORAGE_KEY, { getById: id });
		if (result && typeof result === 'object' && 'type' in result && result.type === 'note') {
			return result;
		}
		return undefined;
	} catch (error) {
		throw new Error(`Failed to get note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

