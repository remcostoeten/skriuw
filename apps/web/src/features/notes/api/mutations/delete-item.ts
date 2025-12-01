import { deleteTasksForNote } from "@/features/tasks";

import { destroy } from '@skriuw/storage/crud/destroy';

const STORAGE_KEY = "Skriuw_notes";

export async function deleteItem(id: string): Promise<boolean> {
	const destroyFn = destroy;
	try {
		// Delete associated tasks before deleting the note
		try {
			await deleteTasksForNote(id);
		} catch (taskError) {
			// Log error but don't fail the note deletion
			console.error('Failed to delete tasks for note:', taskError);
		}

		return await destroyFn(STORAGE_KEY, id);
	} catch (error) {
		throw new Error(`Failed to delete item: ${error instanceof Error ? error.message : String(error)}`);
	}
}

