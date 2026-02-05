'use server'

import type { Folder, CreateFolderData } from '../../types'
import { invalidateItemsCache } from '../queries/get-items'
import { trackActivity } from '@/features/activity'
import { getCurrentUserId } from '@/lib/api-auth'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { create } from '@skriuw/crud'

export async function createFolder(data: CreateFolderData): Promise<Folder> {
	try {
		const userId = await getCurrentUserId()
		if (!userId) {
			throw new Error('User authentication required')
		}

		const result = await create<Folder>(STORAGE_KEYS.NOTES, {
			type: 'folder',
			name: data.name,
			children: [],
			parentFolderId: data.parentFolderId,
			userId // Explicitly set userId from current session
		})

		if (!result.success || !result.data) {
			throw new Error((result as any).error?.message || 'Failed to create folder')
		}

		invalidateItemsCache()

		trackActivity({
			entityType: 'folder',
			entityId: result.data.id,
			action: 'created',
			entityName: data.name
		})

		return result.data
	} catch (error) {
		throw new Error(
			`Failed to create folder: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
