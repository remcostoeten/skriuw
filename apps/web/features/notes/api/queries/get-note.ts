import { readOne } from '@skriuw/crud'

import { STORAGE_KEYS } from '@/lib/storage-keys'
import type { Note } from '../../types'

export async function getNote(id: string): Promise<Note | undefined> {
	try {
		const result = await readOne<Note>(STORAGE_KEYS.NOTES, id)
		if (result.success && result.data && result.data.type === 'note') {
			return result.data
		}
		return undefined
	} catch (error) {
		throw new Error(`Failed to get note: ${error instanceof Error ? error.message : String(error)}`)
	}
}
