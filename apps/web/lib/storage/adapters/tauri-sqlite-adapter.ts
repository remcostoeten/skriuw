import type {
	StorageAdapter,
	StorageAdapterCapabilities,
	ReadAdapterOptions,
	CreateAdapterOptions,
	UpdateAdapterOptions,
	DeleteAdapterOptions,
	BatchReadAdapterOptions,
	BatchCreateAdapterOptions,
	BatchUpdateAdapterOptions,
	BatchDeleteAdapterOptions
} from './types'

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

async function getInvoke(): Promise<TauriInvoke> {
	const core = await import('@tauri-apps/api/core')
	return core.invoke as TauriInvoke
}

async function parseJson<T>(payload: string): Promise<T> {
	return JSON.parse(payload) as T
}

export class TauriSqliteAdapter implements StorageAdapter {
	name = 'tauri-sqlite'
	capabilities: StorageAdapterCapabilities = { backends: ['sqlite'], syncMode: 'local-only' }

	async create<T>(storageKey: string, data: any, options?: CreateAdapterOptions): Promise<T> {
		const invoke = await getInvoke()
		const payload = await invoke<string>('tauri_storage_create', {
			storageKey,
			data: JSON.stringify(data),
			userId: options?.userId ?? null
		})
		return parseJson<T>(payload)
	}

	async read<T>(storageKey: string, options?: ReadAdapterOptions): Promise<T[] | T | undefined> {
		if (options?.getById) {
			const one = await this.readOne<T>(storageKey, options.getById, options)
			return one ?? undefined
		}
		return this.readMany<T>(storageKey, { userId: options?.userId })
	}

	async readOne<T>(
		storageKey: string,
		id: string,
		options?: ReadAdapterOptions
	): Promise<T | null> {
		const invoke = await getInvoke()
		const payload = await invoke<string | null>('tauri_storage_read_one', {
			storageKey,
			id,
			userId: options?.userId ?? null
		})
		if (!payload) return null
		return parseJson<T>(payload)
	}

	async readMany<T>(storageKey: string, options?: BatchReadAdapterOptions): Promise<T[]> {
		const invoke = await getInvoke()
		const payloads = await invoke<string[]>('tauri_storage_read_many', {
			storageKey,
			userId: options?.userId ?? null
		})
		return Promise.all(payloads.map((payload) => parseJson<T>(payload)))
	}

	async update<T>(
		storageKey: string,
		id: string,
		data: any,
		options?: UpdateAdapterOptions
	): Promise<T | undefined> {
		const invoke = await getInvoke()
		const payload = await invoke<string | null>('tauri_storage_update', {
			storageKey,
			id,
			data: JSON.stringify(data),
			userId: options?.userId ?? null
		})
		if (!payload) return undefined
		return parseJson<T>(payload)
	}

	async delete(storageKey: string, id: string, options?: DeleteAdapterOptions): Promise<boolean> {
		const invoke = await getInvoke()
		return invoke<boolean>('tauri_storage_delete', {
			storageKey,
			id,
			userId: options?.userId ?? null
		})
	}

	async batchCreate<T>(
		storageKey: string,
		items: any[],
		options?: BatchCreateAdapterOptions
	): Promise<T[]> {
		return Promise.all(items.map((item) => this.create<T>(storageKey, item, options)))
	}

	async batchRead<T>(
		storageKey: string,
		ids: string[],
		options?: BatchReadAdapterOptions
	): Promise<T[]> {
		const results = await Promise.all(ids.map((id) => this.readOne<T>(storageKey, id, options)))
		const output: T[] = []
		for (const item of results) {
			if (item !== null) output.push(item)
		}
		return output
	}

	async batchUpdate<T>(
		storageKey: string,
		updates: { id: string; data: any }[],
		options?: BatchUpdateAdapterOptions
	): Promise<T[]> {
		const results = await Promise.all(
			updates.map(({ id, data }) => this.update<T>(storageKey, id, data, options))
		)
		const output: T[] = []
		for (const item of results) {
			if (item !== undefined) output.push(item)
		}
		return output
	}

	async batchDelete(
		storageKey: string,
		ids: string[],
		options?: BatchDeleteAdapterOptions
	): Promise<number> {
		const results = await Promise.all(ids.map((id) => this.delete(storageKey, id, options)))
		return results.filter(Boolean).length
	}
}
