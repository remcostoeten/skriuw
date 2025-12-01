import { update } from '@skriuw/storage/crud/update';

import { invalidateItemsCache } from '../queries/get-items';
import type { Note } from '../../types';

const STORAGE_KEY = 'Skriuw_notes';

export async function favoriteNote(
	noteId: string,
	favorite: boolean
): Promise<Note | undefined> {
	const updateFn = update;
	try {
		const result = await updateFn(STORAGE_KEY, noteId, {
			favorite,
		} as any);
		invalidateItemsCache();
		return result as Note | undefined;
	} catch (error) {
		throw new Error(
			`Failed to ${favorite ? 'favorite' : 'unfavorite'} note: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
}
