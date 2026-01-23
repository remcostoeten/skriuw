/**
 * @fileoverview Shared types for Storage Adapters
 */

export type ReadAdapterOptions = {
	getById?: string
	userId?: string
}

export type CreateAdapterOptions = {
	validate?: boolean
	userId?: string
}

export type UpdateAdapterOptions = {
	validate?: boolean
	userId?: string
}

export type DeleteAdapterOptions = {
	userId?: string
}

export type BatchReadAdapterOptions = {
	userId?: string
}

export type BatchCreateAdapterOptions = {
	validate?: boolean
	userId?: string
}

export type BatchUpdateAdapterOptions = {
	validate?: boolean
	userId?: string
}

export type BatchDeleteAdapterOptions = {
	userId?: string
}

export type StorageAdapter = {
	name: string
	read<T>(key: string, options?: ReadAdapterOptions): Promise<T[] | T | undefined>
	readOne<T>(key: string, id: string, options?: ReadAdapterOptions): Promise<T | null>
	readMany<T>(key: string, options?: BatchReadAdapterOptions): Promise<T[]>
	create<T>(key: string, data: any, options?: CreateAdapterOptions): Promise<T>
	update<T>(
		key: string,
		id: string,
		data: any,
		options?: UpdateAdapterOptions
	): Promise<T | undefined>
	delete(key: string, id: string, options?: DeleteAdapterOptions): Promise<boolean>
	batchCreate<T>(key: string, items: any[], options?: BatchCreateAdapterOptions): Promise<T[]>
	batchRead<T>(key: string, ids: string[], options?: BatchReadAdapterOptions): Promise<T[]>
	batchUpdate<T>(
		key: string,
		updates: { id: string; data: any }[],
		options?: BatchUpdateAdapterOptions
	): Promise<T[]>
	batchDelete(key: string, ids: string[], options?: BatchDeleteAdapterOptions): Promise<number>
}

// Define BaseEntity locally if needed or reuse from common
export type BaseEntity = {
	id: string
} & {
	createdAt: number
	updatedAt: number
	deletedAt?: number
}
