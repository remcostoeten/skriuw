import { update } from "@/api/storage/crud/update";

import type { Note, UpdateNoteData } from "../../types";

const STORAGE_KEY = "Skriuw_notes";

export async function updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
	const updateFn = update;
	try {
		const result = await updateFn(STORAGE_KEY, id, {
			name: data.name,
			content: data.content,
		} as any);
		return result as Note | undefined;
	} catch (error) {
		throw new Error(`Failed to update note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

