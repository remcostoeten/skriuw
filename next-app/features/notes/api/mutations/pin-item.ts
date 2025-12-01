import { update } from '@skriuw/storage/crud/update';

import { invalidateItemsCache } from '../queries/get-items';
import type { Note, Folder } from '../../types';

const STORAGE_KEY = 'Skriuw_notes';

export async function pinItem(
	itemId: string,
	itemType: 'note' | 'folder',
	pinned: boolean
): Promise<Note | Folder | undefined> {
	const updateFn = update;
	try {
		const updateData: Partial<Note | Folder> = pinned
			? {
					pinned: true,
					pinnedAt: Date.now(),
			  }
			: {
					pinned: false,
					// Omit pinnedAt when unpinning - let storage layer handle undefined/null
			  };

		const result = await updateFn(STORAGE_KEY, itemId, updateData as any);
		invalidateItemsCache();
		return result as Note | Folder | undefined;
	} catch (error) {
		throw new Error(
			`Failed to ${pinned ? 'pin' : 'unpin'} ${itemType}: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
}
