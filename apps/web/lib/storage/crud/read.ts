import { getGenericStorage } from '../generic-storage-factory'
import type { BaseEntity, ReadOptions as GenericReadOptions } from '../generic-types'

export type ReadOptions<T extends BaseEntity = BaseEntity> = {
	getById?: string
	filter?: (item: T) => boolean
	sort?: (a: T, b: T) => number
	getAll?: boolean
}

export async function read<T extends BaseEntity>(
	storageKey: string,
	options?: ReadOptions<T>
): Promise<T[] | T | undefined> {
	try {
		const storage = getGenericStorage()

		const genericOptions: GenericReadOptions = {
			getById: options?.getById,
			filter: options?.filter as GenericReadOptions['filter'],
			sort: options?.sort as GenericReadOptions['sort'],
			getAll: options?.getAll,
		}

		return await storage.read<T>(storageKey, genericOptions)
	} catch (error) {
		throw new Error(
			`Failed to read from ${storageKey}: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
