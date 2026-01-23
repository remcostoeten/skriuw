import type { Note } from "../../types";
import { readMany } from "@skriuw/crud";

const STORAGE_KEY = 'Skriuw_notes'

export type GetNotesOptions = {
	parentFolderId?: string
}

export async function getNotes(options?: GetNotesOptions): Promise<Note[]> {
	try {
		const result = await readMany<Note>(STORAGE_KEY, {
			filter: (item: any) => {
				const typedItem = item as any
				if (typedItem.type !== 'note') return false
				if (options?.parentFolderId) {
					return typedItem.parentFolderId === options.parentFolderId
				}
				return true
			}
		})

		if (!result.success || !result.data) return []

		return result.data.filter((item: any): item is Note => item.type === 'note')
	} catch (error) {
		throw new Error(
			`Failed to get notes: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
