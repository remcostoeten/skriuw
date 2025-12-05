import { read } from '@skriuw/storage/crud/read'

import type { Item } from '../../types'

const STORAGE_KEY = 'Skriuw_notes'

/** Number of days to keep deleted items in trash */
export const TRASH_RETENTION_DAYS = 30

function filterDeletedItems(items: Item[]): Item[] {
	const result: Item[] = []
	const now = Date.now()
	const retentionMs = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

	for (const item of items) {
		if (item.deletedAt) {
			// Only include if within retention period
			if (now - item.deletedAt < retentionMs) {
				result.push(item)
			}
		}
		if (item.type === 'folder') {
			// Also check children of folders
			const deletedChildren = filterDeletedItems(item.children)
			result.push(...deletedChildren)
		}
	}

	return result
}

export async function getTrashItems(): Promise<Item[]> {
	try {
		const raw = await read(STORAGE_KEY, { getAll: true })
		const items = Array.isArray(raw) ? (raw as Item[]) : []
		return filterDeletedItems(items)
	} catch (error) {
		throw new Error(
			`Failed to get trash items: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
