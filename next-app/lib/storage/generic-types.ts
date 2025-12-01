/**
 * Generic storage types for agnostic storage layer
 * Works with any entity type, not just Notes/Items
 */

export interface BaseEntity {
	id: string
	createdAt: number
	updatedAt: number
}

export interface GenericStorageAdapter {
	readonly name: string
	readonly type: StorageAdapterType

	initialize(): Promise<void>
	destroy(): Promise<void>

	addEventListener(listener: StorageEventListener): void
	removeEventListener(listener: StorageEventListener): void

	isHealthy(): Promise<boolean>
	getStorageInfo(): Promise<StorageInfo>

	create<T extends BaseEntity>(
		storageKey: string,
		data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
	): Promise<T>

	read<T extends BaseEntity>(
		storageKey: string,
		options?: ReadOptions
	): Promise<T[] | T | undefined>

	update<T extends BaseEntity>(
		storageKey: string,
		id: string,
		data: Partial<T>
	): Promise<T | undefined>

	delete(storageKey: string, id: string): Promise<boolean>

	list<T extends BaseEntity>(storageKey: string): Promise<T[]>

	move<T extends BaseEntity>(
		storageKey: string,
		entityId: string,
		targetParentId: string | null
	): Promise<boolean>
}

export interface ReadOptions {
	getById?: string
	filter?: <T>(item: T) => boolean
	sort?: <T>(a: T, b: T) => number
	getAll?: boolean
}

export type StorageAdapterType = 'local' | 'remote' | 'hybrid'

export interface StorageInfo {
	adapter: string
	type: string
	totalItems: number
	sizeBytes?: number
	lastSync?: Date
	isOnline: boolean
	capabilities: StorageCapabilities
}

export interface StorageCapabilities {
	realtime: boolean
	offline: boolean
	sync: boolean
	backup: boolean
	versioning: boolean
	collaboration: boolean
}

export interface StorageConfig {
	adapter: StorageAdapterName
	options?: StorageAdapterOptions
}

export type StorageAdapterName = 'localStorage' | 'database' | 'serverless-api'

export type StorageAdapterOptions = Record<string, unknown>

export interface StorageEvent {
	type: 'created' | 'updated' | 'deleted'
	storageKey: string
	entityId: string
	data?: unknown
}

export type StorageEventListener = (event: StorageEvent) => void
