import {
	getDatabase,
	notes,
	folders,
	tasks,
	storageConnectors,
	eq,
	inArray,
	and,
} from '@skriuw/db'

type TableConfig = { table: any; jsonFields: string[]; hasUserId: boolean }

const TABLES: Record<string, TableConfig> = {
	notes: { table: notes, jsonFields: ['content'], hasUserId: true },
	folders: { table: folders, jsonFields: [], hasUserId: true },
	tasks: { table: tasks, jsonFields: [], hasUserId: true },
	storageConnectors: {
		table: storageConnectors,
		jsonFields: ['config', 'oauth2Tokens'],
		hasUserId: true,
	},
}

function serialize(data: any, jsonFields: string[]) {
	const result = { ...data }
	for (const field of jsonFields) {
		if (result[field] !== undefined && typeof result[field] !== 'string') {
			result[field] = JSON.stringify(result[field])
		}
	}
	if (result.pinned !== undefined) result.pinned = result.pinned ? 1 : 0
	if (result.favorite !== undefined) result.favorite = result.favorite ? 1 : 0
	return result
}

function deserialize(data: any, jsonFields: string[]) {
	const result = { ...data }
	for (const field of jsonFields) {
		if (result[field] && typeof result[field] === 'string') {
			try {
				result[field] = JSON.parse(result[field])
			} catch {
				/* keep as string */
			}
		}
	}
	if ('pinned' in result) result.pinned = result.pinned === 1
	if ('favorite' in result) result.favorite = result.favorite === 1
	return result
}

function getConfig(key: string): TableConfig {
	const config = TABLES[key]
	if (!config) throw new Error(`Unknown table: ${key}`)
	return config
}

function scopedIdCondition(table: any, id: string, userId?: string | null, hasUserId = true) {
	if (userId && hasUserId && table.userId) {
		return and(eq(table.id, id), eq(table.userId, userId))
	}
	return eq(table.id, id)
}

function scopedUserCondition(table: any, userId?: string | null, hasUserId = true) {
	if (userId && hasUserId && table.userId) {
		return eq(table.userId, userId)
	}
	return undefined
}

export const db = {
	async create<T>(table: string, data: any, userId?: string | null): Promise<T> {
		const { table: t, jsonFields, hasUserId } = getConfig(table)
		const entityData = { ...data }
		if (userId && hasUserId) entityData.userId = userId
		const created = (await getDatabase()
			.insert(t)
			.values(serialize(entityData, jsonFields))
			.returning()) as any[]
		return deserialize(created[0], jsonFields) as T
	},

	async findById<T>(table: string, id: string, userId?: string | null): Promise<T | null> {
		const { table: t, jsonFields, hasUserId } = getConfig(table)
		const condition = scopedIdCondition(t, id, userId, hasUserId)
		const result = (await getDatabase().select().from(t).where(condition)) as any[]
		return result[0] ? (deserialize(result[0], jsonFields) as T) : null
	},

	async findAll<T>(table: string, userId?: string | null): Promise<T[]> {
		const { table: t, jsonFields, hasUserId } = getConfig(table)
		const condition = scopedUserCondition(t, userId, hasUserId)
		let query = getDatabase().select().from(t)
		if (condition) query = query.where(condition) as typeof query
		const results = (await query) as any[]
		return results.map((r: any) => deserialize(r, jsonFields) as T)
	},

	async update<T>(
		table: string,
		id: string,
		data: any,
		userId?: string | null,
	): Promise<T | null> {
		const { table: t, jsonFields, hasUserId } = getConfig(table)
		const condition = scopedIdCondition(t, id, userId, hasUserId)
		const updated = (await getDatabase()
			.update(t)
			.set(serialize(data, jsonFields))
			.where(condition)
			.returning()) as any[]
		return updated[0] ? (deserialize(updated[0], jsonFields) as T) : null
	},

	async delete(table: string, id: string, userId?: string | null): Promise<boolean> {
		const { table: t, hasUserId } = getConfig(table)
		const condition = scopedIdCondition(t, id, userId, hasUserId)
		if (table === 'notes') {
			await getDatabase().delete(tasks).where(eq(tasks.noteId, id))
		}
		const deleted = (await getDatabase().delete(t).where(condition).returning()) as any[]
		return deleted.length > 0
	},

	async findAllConnectors<T>(userId: string): Promise<T[]> {
		const result = (await getDatabase()
			.select()
			.from(storageConnectors)
			.where(eq(storageConnectors.userId, userId))) as any[]
		return result.map((r: any) => deserialize(r, ['config', 'oauth2Tokens']) as T)
	},
}
