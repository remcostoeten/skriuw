import { readOne } from '@skriuw/crud'

import type { Note } from '../../types'

const STORAGE_KEY = 'Skriuw_notes'

export async function getNote(id: string): Promise<Note | undefined> {
	try {
		const result = await readOne<Note>(STORAGE_KEY, id)
		if (result.success && result.data && result.data.type === 'note') {
			return result.data
		}
		return undefined
	} catch (error) {
		throw new Error(`Failed to get note: ${error instanceof Error ? error.message : String(error)}`)
	}
}
