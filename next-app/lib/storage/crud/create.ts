import { getGenericStorage } from "../generic-storage-factory"
import type { BaseEntity } from "../generic-types"

export interface CreateOptions {
	merge?: boolean
}

export async function create<T extends BaseEntity>(
	storageKey: string,
	data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<T> {
	try {
		const storage = getGenericStorage()
		return await storage.create<T>(storageKey, data)
	} catch (error) {
		throw new Error(`Failed to create entity in ${storageKey}: ${error instanceof Error ? error.message : String(error)}`)
	}
}
