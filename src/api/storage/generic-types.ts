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

        /**
         * Subscribe to storage events for real-time updates
         */
        addEventListener(listener: StorageEventListener): void

        /**
         * Remove a storage event listener
         */
        removeEventListener(listener: StorageEventListener): void

        isHealthy(): Promise<boolean>
        getStorageInfo(): Promise<StorageInfo>

	/**
	 * Generic CRUD operations
	 */
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

	/**
	 * List all entities for a storage key
	 */
	list<T extends BaseEntity>(storageKey: string): Promise<T[]>

	/**
	 * Move an entity to a different parent (for nested structures)
	 */
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

export type StorageAdapterName = 'localStorage' | 'drizzleLibsqlHttp' | 'drizzleTauriSqlite'

export type StorageAdapterOptions =
        | LibsqlHttpOptions
        | TauriSqliteOptions
        | Record<string, unknown>

export interface LibsqlHttpOptions {
        url: string
        authToken?: string
}

export interface TauriSqliteOptions {
        databasePath?: string
}
        options?: Record<string, unknown>
}

export type StorageAdapterName =
        | 'localStorage'
        /**
         * Drizzle-backed adapters
         */
        | 'drizzleLibsql'
        | 'drizzleLocalSqlite'

export interface StorageEvent {
	type: 'created' | 'updated' | 'deleted'
	storageKey: string
	entityId: string
	data?: unknown
}

export type StorageEventListener = (event: StorageEvent) => void

