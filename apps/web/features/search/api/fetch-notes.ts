import { readMany, readOne } from '@skriuw/crud'
import type { Folder, Note, Item } from '@/features/notes/types'

const STORAGE_KEY = 'Skriuw_notes'

export interface FetchNotesOptions {
	parentFolderId?: string
	search?: string
}

export async function fetchNotes(options?: FetchNotesOptions): Promise<Note[]> {
	try {
		const result = await readMany<Item>(STORAGE_KEY, {
			filter: (item) => {
				if (item.type !== 'note') return false
				if (options?.parentFolderId) {
					return (item as Note).parentFolderId === options.parentFolderId
				}
				if (options?.search) {
					const searchLower = options.search.toLowerCase()
					const note = item as Note
					return note.name.toLowerCase().includes(searchLower)
				}
				return true
			},
		})

		if (!result.success || !result.data) return []

		return result.data.filter((item): item is Note => item.type === 'note')
	} catch (error) {
		throw new Error(
			`Failed to fetch notes: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

export async function fetchFolders(options?: FetchNotesOptions): Promise<Folder[]> {
	try {
		const result = await readMany<Item>(STORAGE_KEY, {
			filter: (item) => {
				if (item.type !== 'folder') return false
				if (options?.parentFolderId) {
					return (item as Folder).parentFolderId === options.parentFolderId
				}
				if (options?.search) {
					const searchLower = options.search.toLowerCase()
					const folder = item as Folder
					return folder.name.toLowerCase().includes(searchLower)
				}
				return true
			},
		})

		if (!result.success || !result.data) return []

		return result.data.filter((item): item is Folder => item.type === 'folder')
	} catch (error) {
		throw new Error(
			`Failed to fetch folders: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

export async function fetchOneNote(noteId: string): Promise<Note | undefined> {
	try {
		const result = await readOne<Note>(STORAGE_KEY, noteId)
		if (result.success && result.data && result.data.type === 'note') {
			return result.data
		}
		return undefined
	} catch (error) {
		throw new Error(
			`Failed to fetch note: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

export async function fetchOneFolder(folderId: string): Promise<Folder | undefined> {
	try {
		const result = await readOne<Folder>(STORAGE_KEY, folderId)
		if (
			result.success &&
			result.data &&
			result.data.type === 'folder'
		) {
			return result.data
		}
		return undefined
	} catch (error) {
		throw new Error(
			`Failed to fetch folder: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
