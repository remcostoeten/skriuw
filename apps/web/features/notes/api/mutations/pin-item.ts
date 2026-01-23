'use server'

import type { Note, Folder, Item } from "../../types";
import { invalidateItemsCache } from "../queries/get-items";
import { trackActivity } from "@/features/activity";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { update } from "@skriuw/crud";

export async function pinItem(
	itemId: string,
	itemType: 'note' | 'folder',
	pinned: boolean
): Promise<Note | Folder | undefined> {
	try {
		const updateData: Partial<Note | Folder> = pinned
			? {
					pinned: true,
					pinnedAt: Date.now()
				}
			: {
					pinned: false
					// Omit pinnedAt when unpinning - let storage layer handle undefined/null
				}

		const result = await update<Item>(STORAGE_KEYS.NOTES, itemId, updateData)
		invalidateItemsCache()

		if (result.data) {
			trackActivity({
				entityType: itemType,
				entityId: itemId,
				action: pinned ? 'pinned' : 'unpinned',
				entityName: result.data.name || 'Untitled'
			})
		}

		return result.data as Note | Folder | undefined
	} catch (error) {
		throw new Error(
			`Failed to ${pinned ? 'pin' : 'unpin'} ${itemType}: ${
				error instanceof Error ? error.message : String(error)
			}`
		)
	}
}
