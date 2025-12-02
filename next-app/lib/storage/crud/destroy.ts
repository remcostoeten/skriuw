import { getGenericStorage } from '../generic-storage-factory'

export interface DestroyOptions {
	recursive?: boolean
}

export async function destroy(
	storageKey: string,
	id: string,
	options?: DestroyOptions
): Promise<boolean> {
	try {
		const storage = getGenericStorage()
		return await storage.delete(storageKey, id)
	} catch (error) {
		throw new Error(
			`Failed to delete entity ${id} from ${storageKey}: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
