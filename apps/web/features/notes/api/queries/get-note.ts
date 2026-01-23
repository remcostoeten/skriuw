import type { Note } from "../../types";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { readOne } from "@skriuw/crud";

const CACHE_TTL_MS = 60000

export async function getNote(id: string, userId?: string): Promise<Note | undefined> {
	try {
		const result = await readOne<Note>(STORAGE_KEYS.NOTES, id, {
			cache: {
				ttl: CACHE_TTL_MS
			},
			userId
		})
		if (result.success && result.data && result.data.type === 'note') {
			return result.data
		}
		return undefined
	} catch (error) {
		throw new Error(
			`Failed to get note: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
