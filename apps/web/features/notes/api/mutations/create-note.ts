'use server'

import { create, readMany } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'
import { getInitialNoteContent } from '../../utils/get-initial-note-content'

import type { Note, CreateNoteData } from '../../types'
import type { SettingsEntity } from '@/features/settings/api/types'
import { trackActivity } from '@/features/activity'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { getCurrentUserId } from '@/lib/api-auth'

const SETTINGS_STORAGE_KEY = 'skriuw:settings'

async function getSettings(): Promise<SettingsEntity | null> {
	const result = await readMany<SettingsEntity>(SETTINGS_STORAGE_KEY)
	if (!result.success || !result.data) return null
	const items = Array.isArray(result.data) ? result.data : []
	return items[0] ?? null
}

export async function createNote(data: CreateNoteData): Promise<Note> {
	try {
		const userId = await getCurrentUserId()
		if (!userId) {
			throw new Error('User authentication required')
		}

		// If content is not provided, get initial content based on settings
		let initialContent = data.content
		if (!initialContent || initialContent.length === 0) {
			const settingsEntity = await getSettings()
			const template =
				(settingsEntity?.settings?.defaultNoteTemplate as
					| 'empty'
					| 'h1'
					| 'h2') || 'empty'
			initialContent = getInitialNoteContent(template)
		}

		console.info(
			`[createNote] Creating note "${data.name}" in ${data.parentFolderId || 'root'}`
		)

		const result = await create<Note>(STORAGE_KEYS.NOTES, {
			type: 'note',
			name: data.name,
			content: initialContent,
			parentFolderId: data.parentFolderId,
			userId // Explicitly set userId from current session
		})

		if (!result.success || !result.data) {
			throw new Error(
				(result as any).error?.message || 'Failed to create note'
			)
		}

		invalidateItemsCache()

		trackActivity({
			entityType: 'note',
			entityId: result.data.id,
			action: 'created',
			entityName: data.name
		})

		return result.data
	} catch (error) {
		throw new Error(
			`Failed to create note: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
