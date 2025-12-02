import { getGenericStorage } from '../generic-storage-factory'
import type { BaseEntity } from '../generic-types'

export interface UpdateOptions {
	merge?: boolean
}

export async function update<T extends BaseEntity>(
	storageKey: string,
	id: string,
	data: Partial<T>,
	options?: UpdateOptions
): Promise<T | undefined> {
	try {
		const storage = getGenericStorage()
		return await storage.update<T>(storageKey, id, data)
	} catch (error) {
		throw new Error(
			`Failed to update entity ${id} in ${storageKey}: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
