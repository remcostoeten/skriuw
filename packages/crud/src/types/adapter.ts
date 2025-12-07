/**
 * @fileoverview Unified Storage Adapter Interface
 * @description Single source of truth for storage adapter type.
 * All CRUD operations use this interface.
 * @module @skriuw/crud/types/adapter
 */

/**
 * Storage adapter interface that backends must implement.
 * This is the contract between the CRUD layer and storage implementations.
 *
 * @example
 * ```typescript
 * const adapter: StorageAdapter = {
 *   async create(storageKey, data) {
 *     // Insert into database/API
 *     return { id: 'new-id', ...data, createdAt: Date.now(), updatedAt: Date.now() }
 *   },
 *   async read(storageKey, options) {
 *     if (options?.getById) return db.get(options.getById)
 *     return db.getAll(storageKey)
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
export interface StorageAdapter {
    /**
     * Creates a new entity in storage.
     * @param storageKey - Collection/table name
     * @param data - Entity data (id may be provided or auto-generated)
     * @returns Created entity with all fields populated
     */
    create<T extends BaseEntity>(
        storageKey: string,
        data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<T>

    /**
     * Reads entities from storage.
     * @param storageKey - Collection/table name
     * @param options - Query options
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
     * @returns Updated entity or undefined if not found
     */
    update<T extends BaseEntity>(
        storageKey: string,
        id: string,
        data: Partial<T>
    ): Promise<T | undefined>

    /**
     * Deletes an entity from storage.
     * @param storageKey - Collection/table name
     * @param id - Entity ID to delete
     * @returns True if deleted, false if not found
     */
    delete(storageKey: string, id: string): Promise<boolean>
}

/**
 * Options for the read adapter method.
 */
export interface ReadAdapterOptions {
    /** Fetch single entity by ID */
    getById?: string
    /** Fetch all entities */
    getAll?: boolean
}
