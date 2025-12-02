import { read } from '@skriuw/storage/crud/read'

import type { Note } from '../../types'

const STORAGE_KEY = 'Skriuw_notes'

export interface GetNotesOptions {
	parentFolderId?: string
}

export async function getNotes(options?: GetNotesOptions): Promise<Note[]> {
	const readFn = read
	try {
		const result = await readFn(STORAGE_KEY, {
			getAll: true,
			filter: (item) => {
				const typedItem = item as any
				if (typedItem.type !== 'note') return false
				if (options?.parentFolderId) {
					return typedItem.parentFolderId === options.parentFolderId
				}
				return true
			},
		})
		return Array.isArray(result)
			? result.filter((item): item is Note => (item as any).type === 'note')
			: []
	} catch (error) {
		throw new Error(
			`Failed to get notes: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
