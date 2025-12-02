import { getGenericStorage } from '../generic-storage-factory'

export async function move(
	storageKey: string,
	entityId: string,
	targetParentId: string | null
): Promise<boolean> {
	try {
		const storage = getGenericStorage()
		return await storage.move(storageKey, entityId, targetParentId)
	} catch (error) {
		throw new Error(
			`Failed to move entity ${entityId} in ${storageKey}: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
