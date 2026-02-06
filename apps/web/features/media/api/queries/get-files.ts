'use server'

import { files } from '@skriuw/db'
import { readOwned } from '@/lib/server/crud-helpers'

export type MediaFile = typeof files.$inferSelect

export async function getFiles() {
	try {
		return await readOwned(files)
	} catch (error) {
		// Return empty array if unauthorized or error
		return []
	}
}
