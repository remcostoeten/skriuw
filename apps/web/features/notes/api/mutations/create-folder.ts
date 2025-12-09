import { create } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'

import type { Folder, CreateFolderData } from '../../types'

import { STORAGE_KEYS } from '@/lib/storage-keys'

export async function createFolder(data: CreateFolderData): Promise<Folder> {
	try {
		const result = await create<Folder>(STORAGE_KEYS.NOTES, {
			type: 'folder',
			name: data.name,
			children: [],
			parentFolderId: data.parentFolderId,
		})

		if (!result.success || !result.data) {
			throw new Error(result.error?.message || 'Failed to create folder')
		}

		invalidateItemsCache()
		return result.data
	} catch (error) {
		throw new Error(
			`Failed to create folder: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
