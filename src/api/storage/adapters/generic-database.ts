// Lazy imports for database functionality
const getDatabaseSchema = async () => {
	const { notes, folders, settings } = await import('@/shared/database/schema')
	return { notes, folders, settings }
}

const getDrizzleOperators = async () => {
	const { eq, and, desc } = await import('drizzle-orm')
	return { eq, and, desc }
}

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
} from '../generic-types'

/**
 * Generic database adapter that works with any entity type
 * Uses Drizzle ORM to store data in PostgreSQL
 */
export interface GenericDatabaseAdapterOptions {
	adapterName?: StorageConfig['adapter']
	adapterType?: StorageAdapterType
	capabilitiesOverride?: Partial<StorageCapabilities>
}

// Map storage keys to database tables
const STORAGE_KEY_TO_TABLE = {
	'Skriuw_notes': { notes, folders },
	// Add more mappings as needed
} as const

type StorageKey = keyof typeof STORAGE_KEY_TO_TABLE

function isStorageKey(key: string): key is StorageKey {
	return key in STORAGE_KEY_TO_TABLE
}

export function createGenericDatabaseAdapter(
	options: GenericDatabaseAdapterOptions = {}
): GenericStorageAdapter {
	const listeners: StorageEventListener[] = []
	const adapterName = options.adapterName ?? 'database'
	const adapterType: StorageAdapterType = options.adapterType ?? 'remote'

	const capabilities: StorageCapabilities = {
		realtime: false,
		offline: false,
		sync: true,
		backup: true,
		versioning: false,
		collaboration: false,
		...options.capabilitiesOverride,
	}

	const emit = (event: StorageEvent): void => {
		listeners.forEach((listener) => {
			try {
				listener(event)
			} catch (error) {
				console.error('Error in storage event listener:', error)
			}
		})
	}

	/**
	 * Determine if an entity is a note or folder based on type field
	 */
	function getEntityType(entity: BaseEntity & { type?: string }): 'note' | 'folder' {
		if ('type' in entity && entity.type === 'folder') {
			return 'folder'
		}
		return 'note'
	}

	const adapter: GenericStorageAdapter = {
		name: adapterName,
		type: adapterType,

		addEventListener(listener: StorageEventListener): void {
			listeners.push(listener)
		},

		removeEventListener(listener: StorageEventListener): void {
			const index = listeners.indexOf(listener)
			if (index > -1) {
				listeners.splice(index, 1)
			}
		},

		async initialize(): Promise<void> {
			// Check if database is available
			if (!isDatabaseAvailable()) {
				throw new Error('Database not available in this environment')
			}

			// Database is already initialized via getDatabase()
			// Just verify connection
			try {
				const db = await getDatabase()
				const { notes } = await getDatabaseSchema()
				// Test query to verify connection
				await db.select().from(notes).limit(1)
			} catch (error) {
				throw new Error(`Failed to initialize database adapter: ${error}`)
			}
		},

		async destroy(): Promise<void> {
			// Database connection cleanup handled by postgres client
			listeners.length = 0
		},

		async isHealthy(): Promise<boolean> {
			try {
				const db = await getDatabase()
				await db.select().from(notes).limit(1)
				return true
			} catch {
				return false
			}
		},

		async getStorageInfo(): Promise<StorageInfo> {
			try {
				const db = await getDatabase()
				const notesCount = (await db.select().from(notes)).length
				const foldersCount = (await db.select().from(folders)).length
				const totalItems = notesCount + foldersCount

				return {
					adapter: adapterName,
					type: adapterType,
					totalItems,
					isOnline: true,
					capabilities,
				}
			} catch (error) {
				return {
					adapter: adapterName,
					type: adapterType,
					totalItems: 0,
					isOnline: false,
					capabilities,
				}
			}
		},

		async create<T extends BaseEntity>(
			storageKey: string,
			data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
		): Promise<T> {
			if (!isStorageKey(storageKey)) {
				throw new Error(`Unsupported storage key: ${storageKey}`)
			}

			const db = await getDatabase()
			const now = Date.now()
			const id = data.id || `${storageKey}-${now}-${Math.random().toString(36).substr(2, 9)}`

			const entityType = getEntityType(data as BaseEntity & { type?: string })
			const entityData = {
				...data,
				id,
				createdAt: now,
				updatedAt: now,
			}

			if (entityType === 'folder') {
				const { children, ...folderData } = entityData as T & { children?: unknown }
				await db.insert(folders).values({
					id,
					name: (folderData as { name: string }).name,
					parentFolderId: (folderData as { parentFolderId?: string }).parentFolderId || null,
					pinned: (folderData as { pinned?: number }).pinned || 0,
					pinnedAt: (folderData as { pinnedAt?: number }).pinnedAt || null,
					createdAt: now,
					updatedAt: now,
					type: 'folder',
				})
			} else {
				// Note
				const noteData = entityData as T & {
					name: string
					content: unknown
					parentFolderId?: string
					pinned?: number
					pinnedAt?: number
					favorite?: number
				}
				await db.insert(notes).values({
					id,
					name: noteData.name,
					content: JSON.stringify(noteData.content || []),
					parentFolderId: noteData.parentFolderId || null,
					pinned: noteData.pinned || 0,
					pinnedAt: noteData.pinnedAt || null,
					favorite: noteData.favorite || 0,
					createdAt: now,
					updatedAt: now,
					type: 'note',
				})
			}

			emit({
				type: 'created',
				storageKey,
				entityId: id,
				data: entityData,
			})

			return entityData as T
		},

		async read<T extends BaseEntity>(
			storageKey: string,
			options?: ReadOptions
		): Promise<T[] | T | undefined> {
			if (!isStorageKey(storageKey)) {
				throw new Error(`Unsupported storage key: ${storageKey}`)
			}

			const db = await getDatabase()

			// If getById is specified, return single entity
			if (options?.getById) {
				// Try notes first
				const note = await db.select().from(notes).where(eq(notes.id, options.getById)).limit(1)
				if (note.length > 0) {
					const n = note[0]
					return {
						id: n.id,
						name: n.name,
						content: JSON.parse(n.content),
						parentFolderId: n.parentFolderId || undefined,
						pinned: n.pinned === 1,
						pinnedAt: n.pinnedAt || undefined,
						favorite: n.favorite === 1,
						createdAt: n.createdAt,
						updatedAt: n.updatedAt,
						type: 'note',
					} as T
				}

				// Try folders
				const folder = await db
					.select()
					.from(folders)
					.where(eq(folders.id, options.getById))
					.limit(1)
				if (folder.length > 0) {
					const f = folder[0]
					// Load children recursively
					const children = await this.list<T>(storageKey)
					const folderChildren = (children as T[]).filter(
						(item) => (item as { parentFolderId?: string }).parentFolderId === f.id
					)
					return {
						id: f.id,
						name: f.name,
						parentFolderId: f.parentFolderId || undefined,
						pinned: f.pinned === 1,
						pinnedAt: f.pinnedAt || undefined,
						createdAt: f.createdAt,
						updatedAt: f.updatedAt,
						type: 'folder',
						children: folderChildren,
					} as T
				}

				return undefined
			}

			// Get all entities
			const allNotes = await db.select().from(notes).orderBy(desc(notes.updatedAt))
			const allFolders = await db.select().from(folders).orderBy(desc(folders.updatedAt))

			const entities: T[] = []

			// Convert notes
			for (const n of allNotes) {
				entities.push({
					id: n.id,
					name: n.name,
					content: JSON.parse(n.content),
					parentFolderId: n.parentFolderId || undefined,
					pinned: n.pinned === 1,
					pinnedAt: n.pinnedAt || undefined,
					favorite: n.favorite === 1,
					createdAt: n.createdAt,
					updatedAt: n.updatedAt,
					type: 'note',
				} as T)
			}

			// Convert folders and build hierarchy
			const folderMap = new Map<string, T>()
			for (const f of allFolders) {
				const folder = {
					id: f.id,
					name: f.name,
					parentFolderId: f.parentFolderId || undefined,
					pinned: f.pinned === 1,
					pinnedAt: f.pinnedAt || undefined,
					createdAt: f.createdAt,
					updatedAt: f.updatedAt,
					type: 'folder',
					children: [] as T[],
				} as T
				folderMap.set(f.id, folder)
			}

			// Build folder hierarchy
			const rootFolders: T[] = []
			for (const folder of folderMap.values()) {
				const parentId = (folder as { parentFolderId?: string }).parentFolderId
				if (parentId && folderMap.has(parentId)) {
					const parent = folderMap.get(parentId)!
					if (!('children' in parent)) {
						;(parent as { children: T[] }).children = []
					}
					;(parent as { children: T[] }).children.push(folder)
				} else {
					rootFolders.push(folder)
				}
			}

			// Add notes to their parent folders
			for (const note of entities) {
				const parentId = (note as { parentFolderId?: string }).parentFolderId
				if (parentId && folderMap.has(parentId)) {
					const parent = folderMap.get(parentId)!
					if (!('children' in parent)) {
						;(parent as { children: T[] }).children = []
					}
					;(parent as { children: T[] }).children.push(note)
				} else {
					rootFolders.push(note)
				}
			}

			let result: T[] = [...rootFolders]

			// Apply filters
			if (options?.filter) {
				result = result.filter(options.filter)
			}

			// Apply sorting
			if (options?.sort) {
				result.sort(options.sort)
			}

			return result
		},

		async update<T extends BaseEntity>(
			storageKey: string,
			id: string,
			data: Partial<T>
		): Promise<T | undefined> {
			if (!isStorageKey(storageKey)) {
				throw new Error(`Unsupported storage key: ${storageKey}`)
			}

			const db = await getDatabase()
			const now = Date.now()

			// Try to find in notes first
			const existingNote = await db.select().from(notes).where(eq(notes.id, id)).limit(1)
			if (existingNote.length > 0) {
				const updateData: Partial<typeof notes.$inferInsert> = {
					updatedAt: now,
				}

				if ('name' in data) updateData.name = data.name as string
				if ('content' in data) updateData.content = JSON.stringify(data.content)
				if ('parentFolderId' in data)
					updateData.parentFolderId = (data.parentFolderId as string) || null
				if ('pinned' in data) updateData.pinned = (data.pinned as boolean) ? 1 : 0
				if ('pinnedAt' in data) updateData.pinnedAt = (data.pinnedAt as number) || null
				if ('favorite' in data) updateData.favorite = (data.favorite as boolean) ? 1 : 0

				await db.update(notes).set(updateData).where(eq(notes.id, id))

				const updated = await db.select().from(notes).where(eq(notes.id, id)).limit(1)
				if (updated.length > 0) {
					const n = updated[0]
					const result = {
						id: n.id,
						name: n.name,
						content: JSON.parse(n.content),
						parentFolderId: n.parentFolderId || undefined,
						pinned: n.pinned === 1,
						pinnedAt: n.pinnedAt || undefined,
						favorite: n.favorite === 1,
						createdAt: n.createdAt,
						updatedAt: n.updatedAt,
						type: 'note',
					} as T

					emit({
						type: 'updated',
						storageKey,
						entityId: id,
						data: result,
					})

					return result
				}
			}

			// Try folders
			const existingFolder = await db.select().from(folders).where(eq(folders.id, id)).limit(1)
			if (existingFolder.length > 0) {
				const updateData: Partial<typeof folders.$inferInsert> = {
					updatedAt: now,
				}

				if ('name' in data) updateData.name = data.name as string
				if ('parentFolderId' in data)
					updateData.parentFolderId = (data.parentFolderId as string) || null
				if ('pinned' in data) updateData.pinned = (data.pinned as boolean) ? 1 : 0
				if ('pinnedAt' in data) updateData.pinnedAt = (data.pinnedAt as number) || null

				await db.update(folders).set(updateData).where(eq(folders.id, id))

				const updated = await db.select().from(folders).where(eq(folders.id, id)).limit(1)
				if (updated.length > 0) {
					const f = updated[0]
					const result = {
						id: f.id,
						name: f.name,
						parentFolderId: f.parentFolderId || undefined,
						pinned: f.pinned === 1,
						pinnedAt: f.pinnedAt || undefined,
						createdAt: f.createdAt,
						updatedAt: f.updatedAt,
						type: 'folder',
						children: [],
					} as T

					emit({
						type: 'updated',
						storageKey,
						entityId: id,
						data: result,
					})

					return result
				}
			}

			return undefined
		},

		async delete(storageKey: string, id: string): Promise<boolean> {
			if (!isStorageKey(storageKey)) {
				throw new Error(`Unsupported storage key: ${storageKey}`)
			}

			const db = await getDatabase()

			// Try notes first
			const note = await db.select().from(notes).where(eq(notes.id, id)).limit(1)
			if (note.length > 0) {
				await db.delete(notes).where(eq(notes.id, id))
				emit({
					type: 'deleted',
					storageKey,
					entityId: id,
				})
				return true
			}

			// Try folders
			const folder = await db.select().from(folders).where(eq(folders.id, id)).limit(1)
			if (folder.length > 0) {
				await db.delete(folders).where(eq(folders.id, id))
				emit({
					type: 'deleted',
					storageKey,
					entityId: id,
				})
				return true
			}

			return false
		},

		async list<T extends BaseEntity>(storageKey: string): Promise<T[]> {
			return (await this.read<T>(storageKey, { getAll: true })) as T[]
		},

		async move<T extends BaseEntity>(
			storageKey: string,
			entityId: string,
			targetParentId: string | null
		): Promise<boolean> {
			if (!isStorageKey(storageKey)) {
				throw new Error(`Unsupported storage key: ${storageKey}`)
			}

			const db = await getDatabase()
			const now = Date.now()

			// Try notes first
			const note = await db.select().from(notes).where(eq(notes.id, entityId)).limit(1)
			if (note.length > 0) {
				await db
					.update(notes)
					.set({ parentFolderId: targetParentId, updatedAt: now })
					.where(eq(notes.id, entityId))
				return true
			}

			// Try folders
			const folder = await db.select().from(folders).where(eq(folders.id, entityId)).limit(1)
			if (folder.length > 0) {
				await db
					.update(folders)
					.set({ parentFolderId: targetParentId, updatedAt: now })
					.where(eq(folders.id, entityId))
				return true
			}

			return false
		},
	}

	return adapter
}


