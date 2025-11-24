import type {
	GenericStorageAdapter,
        BaseEntity,
        ReadOptions,
        StorageInfo,
        StorageAdapterType,
        StorageCapabilities,
        StorageConfig,
        StorageEvent,
        StorageEventListener,
} from "../generic-types"

/**
 * Generic localStorage adapter that works with any entity type
 * Stores data as JSON in localStorage with a storage key
 */
export interface GenericLocalStorageAdapterOptions {
        /**
         * Optional namespace prefix for all storage keys. This keeps different
         * adapters (e.g., libsql replica vs. browser-only) isolated while
         * sharing the same localStorage backend.
         */
        namespace?: string
        adapterName?: StorageConfig['adapter']
        adapterType?: StorageAdapterType
        capabilitiesOverride?: Partial<StorageCapabilities>
}

export function createGenericLocalStorageAdapter(
        options: GenericLocalStorageAdapterOptions = {}
): GenericStorageAdapter {
        const listeners: StorageEventListener[] = []
        const adapterName = options.adapterName ?? 'localStorage'
        const adapterType: StorageAdapterType = options.adapterType ?? 'local'
        const namespace = options.namespace ? `${options.namespace}:` : ''

        const capabilities: StorageCapabilities = {
                realtime: false,
                offline: true,
                sync: false,
                backup: false,
                versioning: false,
                collaboration: false,
                ...options.capabilitiesOverride
        }

        const getNamespacedKey = (storageKey: string): string => `${namespace}${storageKey}`

	const emit = (event: StorageEvent): void => {
		listeners.forEach(listener => {
			try {
				listener(event)
			} catch (error) {
				console.error('Error in storage event listener:', error)
			}
		})
	}

	/**
	 * Get all entities for a storage key
	 */
	function getEntities<T extends BaseEntity>(storageKey: string): T[] {
		try {
                        const stored = localStorage.getItem(getNamespacedKey(storageKey))
			if (stored) {
				const parsed = JSON.parse(stored)
				if (Array.isArray(parsed)) {
					return parsed
				}
				throw new Error(`Invalid data format in storage key: ${storageKey}`)
			}
			return []
		} catch (error) {
			console.error(`Error loading entities from ${storageKey}:`, error)
			return []
		}
	}

        /**
         * Save entities for a storage key
         */
        function saveEntities<T extends BaseEntity>(storageKey: string, entities: T[]): void {
                try {
                        localStorage.setItem(getNamespacedKey(storageKey), JSON.stringify(entities))
                } catch (error) {
                        throw new Error(`Failed to save entities to ${storageKey}: ${error}`)
                }
        }

	/**
	 * Find entity by ID recursively (handles nested structures)
	 */
	function findEntityById<T extends BaseEntity>(
		entities: T[],
		id: string,
		childrenKey?: keyof T
	): T | undefined {
		for (const entity of entities) {
			if (entity.id === id) {
				return entity
			}
			// If entity has children, search recursively
			if (childrenKey && entity[childrenKey]) {
				const children = entity[childrenKey] as unknown as T[]
				if (Array.isArray(children)) {
					const found = findEntityById(children, id, childrenKey)
					if (found) return found
				}
			}
		}
		return undefined
	}

        const adapter: GenericStorageAdapter = {
                name: adapterName,
                type: adapterType,

                addEventListener(listener: StorageEventListener): void {
                        listeners.push(listener)
                },

                removeEventListener(listener: StorageEventListener): void {
                        const index = listeners.indexOf(listener)
                        if (index !== -1) {
                                listeners.splice(index, 1)
                        }
                },

                async initialize(): Promise<void> {
                        if (typeof localStorage === 'undefined') {
                                throw new Error('localStorage is not available')
                        }
		},

		async destroy(): Promise<void> {
			listeners.length = 0
		},

		async isHealthy(): Promise<boolean> {
			try {
				localStorage.setItem('_health_check', 'test')
				localStorage.removeItem('_health_check')
				return true
			} catch {
				return false
			}
		},

		async getStorageInfo(): Promise<StorageInfo> {
                        const allKeys = Object.keys(localStorage)
			let totalItems = 0
			let totalSize = 0

			for (const key of allKeys) {
                                if (!key.startsWith(namespace)) {
                                        continue
                                }

                                const item = localStorage.getItem(key)
				if (item) {
					totalSize += item.length * 2 // UTF-16 encoding
					try {
						const parsed = JSON.parse(item)
						if (Array.isArray(parsed)) {
							totalItems += parsed.length
						}
					} catch {
						// Not JSON, skip
					}
				}
			}

			return {
                                adapter: adapterName,
                                type: adapterType,
                                totalItems,
                                sizeBytes: totalSize,
                                isOnline: navigator.onLine,
                                capabilities,
                        }
                },

		async create<T extends BaseEntity>(
			storageKey: string,
			data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
		): Promise<T> {
			const entities = getEntities<T>(storageKey)
			const now = Date.now()
			const id = data.id || `${storageKey}-${now}-${Math.random().toString(36).substr(2, 9)}`

			const newEntity: T = {
				...data,
				id,
				createdAt: now,
				updatedAt: now,
			} as T

			// Handle parent-child relationships (for nested structures like folders)
			const parentId = (data as any).parentFolderId
			if (parentId) {
				const parent = findEntityById(entities, parentId, 'children' as keyof T)
				if (parent && 'children' in parent) {
					const children = (parent as any).children
					if (Array.isArray(children)) {
						children.push(newEntity)
						saveEntities(storageKey, entities)
						emit({
							type: 'created',
							storageKey,
							entityId: id,
							data: newEntity,
						})
						return newEntity
					}
				}
			}

			// Add to root level if no parent or parent not found
			entities.push(newEntity)
			saveEntities(storageKey, entities)

			emit({
				type: 'created',
				storageKey,
				entityId: id,
				data: newEntity,
			})

			return newEntity
		},

		async read<T extends BaseEntity>(
			storageKey: string,
			options?: ReadOptions
		): Promise<T[] | T | undefined> {
			const entities = getEntities<T>(storageKey)

			// If getById is specified, return single entity
			if (options?.getById) {
				const entity = findEntityById(entities, options.getById, 'children' as keyof T)
				if (!entity) {
					return undefined
				}
				if (options.filter && !options.filter(entity)) {
					return undefined
				}
				return entity
			}

			// Otherwise return array (filtered/sorted if needed)
			let result: T[] = entities

			if (options?.filter) {
				result = result.filter(options.filter)
			}

			if (options?.sort) {
				result = result.sort(options.sort)
			}

			return result
		},

		async update<T extends BaseEntity>(
			storageKey: string,
			id: string,
			data: Partial<T>
		): Promise<T | undefined> {
			const entities = getEntities<T>(storageKey)
			const entity = findEntityById(entities, id, 'children' as keyof T)

			if (!entity) {
				return undefined
			}

			const updatedEntity: T = {
				...entity,
				...data,
				id: entity.id, // Preserve ID
				updatedAt: Date.now(),
			} as T

			// Update recursively in nested structures
			const updateRecursive = (itemList: T[]): boolean => {
				const index = itemList.findIndex(e => e.id === id)
				if (index !== -1) {
					itemList[index] = updatedEntity
					return true
				}

				// Search in children
				for (const item of itemList) {
					if ('children' in item && Array.isArray((item as any).children)) {
						if (updateRecursive((item as any).children)) {
							return true
						}
					}
				}

				return false
			}

			updateRecursive(entities)
			saveEntities(storageKey, entities)

			emit({
				type: 'updated',
				storageKey,
				entityId: id,
				data: updatedEntity,
			})

			return updatedEntity
		},

		async delete(storageKey: string, id: string): Promise<boolean> {
			const entities = getEntities<BaseEntity>(storageKey)

			const deleteRecursive = (itemList: BaseEntity[], childrenKey?: keyof BaseEntity): boolean => {
				const index = itemList.findIndex(item => item.id === id)
				if (index !== -1) {
					itemList.splice(index, 1)
					return true
				}

				// Search in children if present
				if (childrenKey) {
					for (const item of itemList) {
						const children = item[childrenKey] as unknown as BaseEntity[]
						if (Array.isArray(children) && deleteRecursive(children, childrenKey)) {
							return true
						}
					}
				}

				return false
			}

			const found = deleteRecursive(entities, 'children' as keyof BaseEntity)
			if (found) {
				saveEntities(storageKey, entities)
				emit({
					type: 'deleted',
					storageKey,
					entityId: id,
				})
			}

			return found
		},

		async list<T extends BaseEntity>(storageKey: string): Promise<T[]> {
			return getEntities<T>(storageKey)
		},

		async move<T extends BaseEntity>(
			storageKey: string,
			entityId: string,
			targetParentId: string | null
		): Promise<boolean> {
			const entities = getEntities<T>(storageKey)
			
			// Find the entity to move
			const entity = findEntityById(entities, entityId, 'children' as keyof T)
			if (!entity) {
				return false
			}

			// Remove from current location
			const removeRecursive = (itemList: T[]): boolean => {
				const index = itemList.findIndex(i => i.id === entityId)
				if (index !== -1) {
					itemList.splice(index, 1)
					return true
				}

				for (const item of itemList) {
					if ('children' in item && Array.isArray((item as any).children)) {
						if (removeRecursive((item as any).children)) {
							return true
						}
					}
				}

				return false
			}

			if (!removeRecursive(entities)) {
				return false
			}

			const updatedEntity = { ...entity } as T
			if ('parentFolderId' in updatedEntity) {
				(updatedEntity as any).parentFolderId = targetParentId ?? undefined
			}
			updatedEntity.updatedAt = Date.now()

			if (targetParentId) {
				const targetParent = findEntityById(entities, targetParentId, 'children' as keyof T)
				if (targetParent && 'children' in targetParent) {
					const children = (targetParent as any).children
					if (Array.isArray(children)) {
						children.push(updatedEntity)
					} else {
						// Add to root if parent not found or invalid
						entities.push(updatedEntity)
					}
				} else {
					// Add to root if parent not found
					entities.push(updatedEntity)
				}
			} else {
				// Add to root
				entities.push(updatedEntity)
			}

			saveEntities(storageKey, entities)
			emit({
				type: 'updated',
				storageKey,
				entityId,
				data: updatedEntity,
			})

			return true
		},
	}

	return adapter
}

