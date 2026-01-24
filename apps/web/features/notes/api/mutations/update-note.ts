'use server'

import { syncTasksToDatabase } from "../../../tasks";
import type { Note, UpdateNoteData } from "../../types";
import { extractTasksFromBlocks } from "../../utils/extract-tasks";
import { invalidateItemsCache } from "../queries/get-items";
import { trackActivity } from "@/features/activity";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { update } from "@skriuw/crud";

export async function updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
	try {
		const result = await update<Note>(STORAGE_KEYS.NOTES, id, {
			name: data.name,
			content: data.content,
			icon: data.icon,
			tags: data.tags,
		})

		if (!result.success) {
			throw new Error((result as any).error?.message || 'Failed to update note')
		}

		// Invalidate cache after update
		invalidateItemsCache()

		// Sync tasks to database if content was updated
		if (data.content && Array.isArray(data.content)) {
			try {
				const extractedTasks = extractTasksFromBlocks(data.content, id)

				// Basic optimization: only sync if there are tasks OR if we need to clear them
				// To be truly efficient, we'd compare with previous tasks, but updateNote
				// doesn't have previous content here.
				await syncTasksToDatabase(id, extractedTasks)
			} catch (taskError) {
				// Log error but don't fail note update
				console.error('Failed to sync tasks to database:', taskError)
			}
		}

		if (result.data) {
			trackActivity({
				entityType: 'note',
				entityId: id,
				action: 'updated',
				entityName: result.data.name || 'Untitled'
			})
		}

		return result.data ?? undefined
	} catch (error) {
		throw new Error(
			`Failed to update note: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
