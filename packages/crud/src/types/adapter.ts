import type { BaseEntity } from './base'

export type StorageBackend = 'remote' | 'sqlite' | 'filesystem' | 'local-storage'

export type StorageSyncMode = 'local-only' | 'sync-capable' | 'remote-only'

export type StorageAdapterCapabilities = {
	/**
	 * Backends this adapter can operate with.
	 * Examples: ['sqlite'], ['filesystem'], ['remote'], ['local-storage']
	 */
	backends: StorageBackend[]
	/**
	 * Describes whether this adapter can remain local-only or sync remotely.
	 */
	syncMode: StorageSyncMode
}

/**
 * Storage adapter interface that backends must implement.
 * This is the contract between the CRUD layer and storage implementations.
 *
 * @example
 * ```typescript
 * const adapter: StorageAdapter = {
 *   async create(storageKey, data, options) {
 *     // Insert into database/API with userId if provided
 *     return { id: 'new-id', ...data, userId: options?.userId, createdAt: Date.now(), updatedAt: Date.now() }
 *   },
 *   async read(storageKey, options) {
 *     if (options?.getById) return db.get(options.getById)
 *     // Filter by userId if provided
 *     return db.getAll(storageKey, { userId: options?.userId })
 *   },
 *   async update(storageKey, id, data) {
 *     return db.update(id, data)
 *   },
 *   async delete(storageKey, id) {
 *     return db.delete(id)
 *   }
 * }
 * ```
 */
export type StorageAdapter = {
	/**
	 * Optional runtime capability metadata for platform/strategy selection.
	 * Keep optional for backwards compatibility with existing adapters.
	 */
	capabilities?: StorageAdapterCapabilities

	/**
	 * Creates a new entity in storage.
	 * @param storageKey - Collection/table name
	 * @param data - Entity data (id may be provided or auto-generated)
	 * @param options - Create options including userId
	 * @returns Created entity with all fields populated
	 */
	create<T extends BaseEntity>(
		storageKey: string,
		data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
		options?: CreateAdapterOptions
	): Promise<T>

	/**
	 * Reads entities from storage.
	 * @param storageKey - Collection/table name
	 * @param options - Query options including userId for filtering
	 * @returns Single entity, array, or undefined
	 */
	read<T extends BaseEntity>(
		storageKey: string,
		options?: ReadAdapterOptions
	): Promise<T[] | T | undefined>

	/**
	 * Updates an existing entity.
	 * @param storageKey - Collection/table name
	 * @param id - Entity ID to update
	 * @param data - Partial data to merge
	 * @param options - Update options including userId for ownership verification
	 * @returns Updated entity or undefined if not found
	 */
	update<T extends BaseEntity>(
		storageKey: string,
		id: string,
		data: Partial<T>,
		options?: UpdateAdapterOptions
	): Promise<T | undefined>

	/**
	 * Deletes an entity from storage.
	 * @param storageKey - Collection/table name
	 * @param id - Entity ID to delete
	 * @param options - Delete options including userId for ownership verification
	 * @returns True if deleted, false if not found
	 */
	delete(storageKey: string, id: string, options?: DeleteAdapterOptions): Promise<boolean>
}

/**
 * Options for the create adapter method.
 */
export type CreateAdapterOptions = {
	/** User ID to associate with the created entity */
	userId?: string | null
}

/**
 * Options for the read adapter method.
 */
export type ReadAdapterOptions = {
	/** Fetch single entity by ID */
	getById?: string
	/** Fetch all entities */
	getAll?: boolean
	/** Filter results to entities owned by this user */
	userId?: string | null
}

/**
 * Options for the update adapter method.
 */
export type UpdateAdapterOptions = {
	/** Only update if entity belongs to this user */
	userId?: string | null
}

/**
 * Options for the delete adapter method.
 */
export type DeleteAdapterOptions = {
	/** Only delete if entity belongs to this user */
	userId?: string | null
}
