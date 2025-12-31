import { createClientApiAdapter } from './adapters/client-api'

interface StorageAdapter {
	name: string
	read<T>(key: string, options?: any): Promise<T[] | T | undefined>
	readOne<T>(key: string, id: string, options?: any): Promise<T | null>
	readMany<T>(key: string, options?: any): Promise<T[]>
	create<T>(key: string, data: any, options?: any): Promise<T>
	update<T>(
		key: string,
		id: string,
		data: any,
		options?: any
	): Promise<T | undefined>
	delete(key: string, id: string, options?: any): Promise<boolean>
	batchCreate<T>(key: string, items: any[], options?: any): Promise<T[]>
	batchRead<T>(key: string, ids: string[], options?: any): Promise<T[]>
	batchUpdate<T>(
		key: string,
		updates: { id: string; data: any }[],
		options?: any
	): Promise<T[]>
	batchDelete(key: string, ids: string[], options?: any): Promise<number>
}

export const storageAdapter: StorageAdapter = createClientApiAdapter()

export { createClientApiAdapter } from './adapters/client-api'
