import { readMany } from '@skriuw/crud'

import type { Item } from '../../types'

import { STORAGE_KEYS } from '@/lib/storage-keys'

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
		const result = await readMany<Item>(STORAGE_KEYS.NOTES)
		const items = result.success && result.data ? result.data : []
		return filterDeletedItems(items)
	} catch (error) {
		throw new Error(
			`Failed to get trash items: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
