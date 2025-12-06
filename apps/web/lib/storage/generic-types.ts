/**
 * Generic storage types for agnostic storage layer
 * Works with any entity type, not just Notes/Items
 */

export type BaseEntity = {
	id: string
	createdAt: number
	updatedAt: number
}

export interface GenericStorageAdapter {
	/**
	 * Unique identifier for the adapter
	 */
	readonly name: string
	/**
	 * Type of the adapter
	 */
	readonly type: StorageAdapterType

	/**
	 * Initializes the adapter
	 */
	initialize(): Promise<void>
	/**
	 * Destroys the adapter
	 */
	destroy(): Promise<void>

	/**
	 * Adds an event listener to the adapter
	 */
	addEventListener(listener: StorageEventListener): void
	/**
	 * Removes an event listener from the adapter
	 */
	removeEventListener(listener: StorageEventListener): void

	/**
	 * Checks if the adapter is healthy
	 */
	isHealthy(): Promise<boolean>
	/**
	 * Gets storage information
	 */
	getStorageInfo(): Promise<StorageInfo>

	/**
	 * Creates a new entity in the storage
	 */
	create<T extends BaseEntity>(
		storageKey: string,
		data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
	): Promise<T>

	/**
	 * Reads an entity from the storage
	 */
	read<T extends BaseEntity>(
		storageKey: string,
		options?: ReadOptions
	): Promise<T[] | T | undefined>

	/**
	 * Updates an entity in the storage
	 */
	update<T extends BaseEntity>(
		storageKey: string,
		id: string,
		data: Partial<T>
	): Promise<T | undefined>

	/**
	 * Deletes an entity from the storage
	 */
	delete(storageKey: string, id: string): Promise<boolean>

	/**
	 * Lists all entities in the storage
	 */
	list<T extends BaseEntity>(storageKey: string): Promise<T[]>

	/**
	 * Moves an entity to a new parent
	 */
	move<T extends BaseEntity>(
		storageKey: string,
		entityId: string,
		targetParentId: string | null
	): Promise<boolean>
}

/**
 * Options for reading entities from the storage
 */
export interface ReadOptions {
	getById?: string
	filter?: <T>(item: T) => boolean
	sort?: <T>(a: T, b: T) => number
	getAll?: boolean
}

/**
 * Type of the storage adapter
 */
export type StorageAdapterType = 'local' | 'remote' | 'hybrid'

/**
 * Information about the storage adapter
 */
export interface StorageInfo {
	adapter: string
	type: string
	totalItems: number
	sizeBytes?: number
	lastSync?: Date
	isOnline: boolean
	capabilities: StorageCapabilities
}

/**
 * Capabilities of the storage adapter
 */
export interface StorageCapabilities {
	realtime: boolean
	offline: boolean
	sync: boolean
	backup: boolean
	versioning: boolean
	collaboration: boolean
}

/**
 * Configuration for the storage adapter
 */
export interface StorageConfig {
	adapter: StorageAdapterName
	options?: StorageAdapterOptions
}

/**
 * Name of the storage adapter
 */
export type StorageAdapterName = 'localStorage' | 'database' | 'serverless-api'

/**
 * Options for the storage adapter
 */
export type StorageAdapterOptions = Record<string, unknown>

/**
 * Event emitted by the storage adapter
 */
export interface StorageEvent {
	type: 'created' | 'updated' | 'deleted'
	storageKey: string
	entityId: string
	data?: unknown
}

/**
 * Event listener for storage events
 */
export type StorageEventListener = (event: StorageEvent) => void
