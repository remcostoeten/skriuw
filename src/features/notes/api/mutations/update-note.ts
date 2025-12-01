import { extractTasksFromBlocks } from "@/features/notes/utils/extract-tasks";
import { syncTasksToDatabase } from "@/features/tasks";

import { update } from "@/api/storage/crud/update";

import type { Note, UpdateNoteData } from "../../types";

const STORAGE_KEY = "Skriuw_notes";

export async function updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
	const updateFn = update;
	try {
		const result = await updateFn(STORAGE_KEY, id, {
			name: data.name,
			content: data.content,
		} as Partial<Note>);

		// Sync tasks to database if content was updated
		if (data.content && Array.isArray(data.content)) {
			try {
				const extractedTasks = extractTasksFromBlocks(data.content, id);
				await syncTasksToDatabase(id, extractedTasks);
			} catch (taskError) {
				// Log error but don't fail the note update
				console.error('Failed to sync tasks to database:', taskError);
			}
		}

		return result as Note | undefined;
	} catch (error) {
		throw new Error(`Failed to update note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

