/**
 * @file serverless-api.ts
 * @description Serverless API adapter for database operations via Next.js API route
 */

import type {
	GenericStorageAdapter,
	BaseEntity,
	ReadOptions,
	StorageInfo,
	StorageAdapterType,
	StorageCapabilities,
	StorageEvent,
	StorageEventListener,
} from '../generic-types'

export function createServerlessApiAdapter(baseUrl?: string): GenericStorageAdapter {
	const listeners: StorageEventListener[] = []
	const apiBaseUrl = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
	const NOTES_STORAGE_KEY = 'Skriuw_notes'
	const SETTINGS_STORAGE_KEY = 'app:settings'
	const SHORTCUTS_STORAGE_KEY = 'quantum-works:shortcuts:custom'

	const capabilities: StorageCapabilities = {
		realtime: false,
		offline: false,
		sync: true,
		backup: true,
		versioning: false,
		collaboration: false,
	}

	const countItems = (items: any[]): number => {
		return items.reduce((total, item) => {
			if (item?.type === 'folder' && Array.isArray(item.children)) {
				return total + 1 + countItems(item.children)
			}
			return total + 1
		}, 0)
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

	const apiCall = async (endpoint: string, options: RequestInit = {}) => {
		const url = `${apiBaseUrl}/api${endpoint}`
		const response = await globalThis.fetch(url, {
			headers: {
				'Content-Type': 'application/json',
				...options.headers,
			},
			...options,
		})

		const responseText = await response.text()
		const contentType = response.headers.get('content-type')

		if (!response.ok) {
			let errorMessage = `API error: ${response.status}`
			if (responseText) {
				try {
					const errorJson = JSON.parse(responseText)
					errorMessage = errorJson.message || errorJson.error || errorMessage
				} catch {
					errorMessage = `${response.status} - ${responseText.substring(0, 200)}`
				}
			}
			throw new Error(errorMessage)
		}

		const isJson = contentType?.includes('application/json')
		if (!isJson) {
			throw new Error(`API endpoint returned non-JSON response: ${contentType}`)
		}

		try {
			return JSON.parse(responseText)
		} catch (jsonError) {
			throw new Error(`Invalid JSON response from '${endpoint}'`)
		}
	}

	const adapter: GenericStorageAdapter = {
		name: 'serverless-api',
		type: 'remote' as StorageAdapterType,

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
			try {
				await apiCall('/notes')
			} catch (error) {
				console.error('Failed to initialize serverless API adapter:', error)
				throw new Error(`API connection failed: ${error}`)
			}
		},

		async destroy(): Promise<void> {
			listeners.length = 0
		},

		async isHealthy(): Promise<boolean> {
			try {
				await apiCall('/notes')
				return true
			} catch {
				return false
			}
		},

		async getStorageInfo(): Promise<StorageInfo> {
			try {
				const allItems = await apiCall('/notes')
				const totalItems = Array.isArray(allItems) ? countItems(allItems) : 0

				return {
					adapter: 'serverless-api',
					type: 'remote' as StorageAdapterType,
					totalItems,
					isOnline: true,
					capabilities,
				}
			} catch {
				return {
					adapter: 'serverless-api',
					type: 'remote' as StorageAdapterType,
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
			if (storageKey === NOTES_STORAGE_KEY) {
				const payload = { ...data } as Record<string, unknown>
				delete payload.children

				const result = await apiCall('/notes', {
					method: 'POST',
					body: JSON.stringify(payload),
				})

				emit({
					type: 'created',
					storageKey,
					entityId: result.id,
					data: result,
				})

				return result as T
			}

			if (storageKey === SETTINGS_STORAGE_KEY) {
				const result = await apiCall('/settings', {
					method: 'POST',
					body: JSON.stringify({ settings: (data as any).settings ?? {} }),
				})

				emit({
					type: 'created',
					storageKey,
					entityId: result.id,
					data: result,
				})

				return result as T
			}

			if (storageKey === SHORTCUTS_STORAGE_KEY) {
				const result = await apiCall('/shortcuts', {
					method: 'POST',
					body: JSON.stringify(data),
				})

				emit({
					type: 'created',
					storageKey,
					entityId: result.id,
					data: result,
				})

				return result as T
			}

			throw new Error(`Unsupported storage key: ${storageKey}`)
		},

		async read<T extends BaseEntity>(
			storageKey: string,
			options?: ReadOptions
		): Promise<T[] | T | undefined> {
			if (storageKey === NOTES_STORAGE_KEY) {
				if (options?.getById) {
					try {
						return (await apiCall(`/notes?id=${encodeURIComponent(options.getById)}`)) as T
					} catch (error) {
						const message = (error as Error).message?.toLowerCase() ?? ''
						if (message.includes('404') || message.includes('not found')) {
							return undefined
						}
						throw error
					}
				}

				const items = await apiCall('/notes')
				return items as T[]
			}

			if (storageKey === SETTINGS_STORAGE_KEY) {
				const result = await apiCall('/settings')
				if (!result) return options?.getById ? undefined : []
				return options?.getById ? (result as T) : ([result] as T[])
			}

			if (storageKey === SHORTCUTS_STORAGE_KEY) {
				if (options?.getById) {
					try {
						return (await apiCall(`/shortcuts?id=${encodeURIComponent(options.getById)}`)) as T
					} catch (error) {
						const message = (error as Error).message?.toLowerCase() ?? ''
						if (message.includes('404') || message.includes('not found')) {
							return undefined
						}
						throw error
					}
				}

				const shortcuts = await apiCall('/shortcuts')
				return shortcuts as T[]
			}

			throw new Error(`Unsupported storage key: ${storageKey}`)
		},

		async update<T extends BaseEntity>(
			storageKey: string,
			id: string,
			data: Partial<T>
		): Promise<T | undefined> {
			if (storageKey === NOTES_STORAGE_KEY) {
				const payload = { ...data } as Record<string, unknown>
				delete payload.children

				const result = await apiCall('/notes', {
					method: 'PUT',
					body: JSON.stringify({ id, ...payload }),
				})

				emit({
					type: 'updated',
					storageKey,
					entityId: id,
					data: result,
				})

				return result as T
			}

			if (storageKey === SETTINGS_STORAGE_KEY) {
				const result = await apiCall('/settings', {
					method: 'POST',
					body: JSON.stringify({ settings: (data as any).settings ?? {} }),
				})

				emit({
					type: 'updated',
					storageKey,
					entityId: result.id,
					data: result,
				})

				return result as T
			}

			if (storageKey === SHORTCUTS_STORAGE_KEY) {
				const result = await apiCall('/shortcuts', {
					method: 'PUT',
					body: JSON.stringify({ id, ...data }),
				})

				emit({
					type: 'updated',
					storageKey,
					entityId: id,
					data: result,
				})

				return result as T
			}

			throw new Error(`Unsupported storage key: ${storageKey}`)
		},

		async delete(storageKey: string, id: string): Promise<boolean> {
			if (storageKey === NOTES_STORAGE_KEY) {
				await apiCall(`/notes?id=${encodeURIComponent(id)}`, {
					method: 'DELETE',
				})

				emit({
					type: 'deleted',
					storageKey,
					entityId: id,
				})

				return true
			}

			if (storageKey === SETTINGS_STORAGE_KEY) {
				await apiCall('/settings', {
					method: 'DELETE',
				})

				emit({
					type: 'deleted',
					storageKey,
					entityId: id,
				})

				return true
			}

			if (storageKey === SHORTCUTS_STORAGE_KEY) {
				await apiCall(`/shortcuts?id=${encodeURIComponent(id)}`, {
					method: 'DELETE',
				})

				emit({
					type: 'deleted',
					storageKey,
					entityId: id,
				})

				return true
			}

			throw new Error(`Unsupported storage key: ${storageKey}`)
		},

		async list<T extends BaseEntity>(storageKey: string): Promise<T[]> {
			return (await this.read<T>(storageKey)) as T[]
		},

		async move<T extends BaseEntity>(
			storageKey: string,
			entityId: string,
			targetParentId: string | null
		): Promise<boolean> {
			if (storageKey !== NOTES_STORAGE_KEY) {
				throw new Error(`Move operation unsupported for ${storageKey}`)
			}

			return (
				(await this.update<T>(storageKey, entityId, {
					parentFolderId: targetParentId,
				} as unknown as Partial<T>)) !== undefined
			)
		},
	}

	return adapter
}
