import { create } from '@/lib/storage/client'
import { getSettings } from '@/features/settings/api/queries/get-settings'

import { invalidateItemsCache } from '../queries/get-items'
import { getInitialNoteContent } from '../../utils/get-initial-note-content'

import type { Note, CreateNoteData } from '../../types'

const STORAGE_KEY = 'Skriuw_notes'

export async function createNote(data: CreateNoteData): Promise<Note> {
	try {
		// If content is not provided, get initial content based on settings
		let initialContent = data.content
		if (!initialContent || initialContent.length === 0) {
			const settings = await getSettings()
			const template = (settings?.defaultNoteTemplate as 'empty' | 'h1' | 'h2') || 'empty'
			initialContent = getInitialNoteContent(template)
		}

		console.info(`[createNote] Creating note "${data.name}" in ${data.parentFolderId || 'root'}`)

		const result = await create<Note>(STORAGE_KEY, {
			type: 'note',
			name: data.name,
			content: initialContent,
			parentFolderId: data.parentFolderId,
		} as any)

		if (!result.success || !result.data) {
			throw new Error(result.error?.message || 'Failed to create note')
		}

		// Cache invalidation is handled by @skriuw/crud automatically for the storage key
		// But getItems wraps it with specific logic, so we keep this calls for now
		// to ensure the UI updates (even though getItems now just invalidates storage key)
		invalidateItemsCache()

		return result.data
	} catch (error) {
		throw new Error(
			`Failed to create note: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
