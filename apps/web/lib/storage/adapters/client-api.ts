/**
 * @fileoverview Client API Adapter for @skriuw/crud
 * @description Implements StorageAdapter interface for browser-to-API communication.
 * Supports user-scoped operations via userId parameter.
 */

import { generatePreseededItems, hasPreseededItems, markPreseededItems } from '../../preseed-data'

// Define types locally since crud package has issues
type BaseEntity = {
	id: string
} & {
	createdAt: number
	updatedAt: number
	deletedAt?: number
}

interface ReadAdapterOptions {
	getById?: string
	userId?: string
}

interface CreateAdapterOptions {
	validate?: boolean
	userId?: string
}

interface UpdateAdapterOptions {
	validate?: boolean
	userId?: string
}

interface DeleteAdapterOptions {
	userId?: string
}

interface BatchReadAdapterOptions {
	userId?: string
}

interface BatchCreateAdapterOptions {
	validate?: boolean
	userId?: string
}

interface BatchUpdateAdapterOptions {
	validate?: boolean
	userId?: string
}

interface BatchDeleteAdapterOptions {
	userId?: string
}

interface StorageAdapter {
	name: string
	read<T>(
		key: string,
		options?: ReadAdapterOptions
	): Promise<T[] | T | undefined>
	readOne<T>(
		key: string,
		id: string,
		options?: ReadAdapterOptions
	): Promise<T | null>
	readMany<T>(key: string, options?: BatchReadAdapterOptions): Promise<T[]>
	create<T>(
		key: string,
		data: any,
		options?: CreateAdapterOptions
	): Promise<T>
	update<T>(
		key: string,
		id: string,
		data: any,
		options?: UpdateAdapterOptions
	): Promise<T | undefined>
	delete(
		key: string,
		id: string,
		options?: DeleteAdapterOptions
	): Promise<boolean>
	batchCreate<T>(
		key: string,
		items: any[],
		options?: BatchCreateAdapterOptions
	): Promise<T[]>
	batchRead<T>(
		key: string,
		ids: string[],
		options?: BatchReadAdapterOptions
	): Promise<T[]>
	batchUpdate<T>(
		key: string,
		updates: { id: string; data: any }[],
		options?: BatchUpdateAdapterOptions
	): Promise<T[]>
	batchDelete(
		key: string,
		ids: string[],
		options?: BatchDeleteAdapterOptions
	): Promise<number>
}

export class AuthRequiredError extends Error {
	status: number
	constructor(message: string, status: number) {
		super(message)
		this.status = status
	}
}

/** Storage key mappings to API endpoints */
const ENDPOINT_MAP: Record<string, string> = {
	notes: '/api/notes',
	'skriuw:notes': '/api/notes',
	skriuw_notes: '/api/notes',
	folders: '/api/notes',
	tasks: '/api/tasks',
	settings: '/api/settings',
	'skriuw:settings': '/api/settings',
	'app:settings': '/api/settings',
	shortcuts: '/api/shortcuts',
	'skriuw:shortcuts:custom': '/api/shortcuts'
}

/**
 * Resolves a storage key to its API endpoint
 */
function getEndpoint(storageKey: string): string {
	const normalized = storageKey.toLowerCase()
	const endpoint = ENDPOINT_MAP[normalized]
	if (!endpoint) {
		// Default to pluralized resource endpoint
		return `/api/${storageKey.split(':').pop() ?? storageKey}`
	}
	return endpoint
}

/**
 * Builds URL with query parameters, including userId if provided.
 */
function buildUrl(
	baseUrl: string,
	endpoint: string,
	params?: Record<string, string | null | undefined>
): string {
	const url = new URL(endpoint, baseUrl)
	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			if (value != null) {
				url.searchParams.set(key, value)
			}
		})
	}
	return url.toString()
}

/**
 * Creates a client-side API adapter for @skriuw/crud
 * Supports user-scoped operations by passing userId in requests.
 *
 * @param baseUrl - Optional base URL (defaults to window.location.origin)
 */
/**
 * Global API request handler with standardized error handling and typing.
 * Can be used directly for custom endpoints that don't fit the strict CRUD adapter model.
 */
export async function apiRequest<T>(
	endpoint: string,
	options: RequestInit = {},
	baseUrl?: string
): Promise<T> {
	const apiBaseUrl =
		baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')

	const url = endpoint.startsWith('http')
		? endpoint
		: `${apiBaseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`

	const response = await globalThis.fetch(url, {
		headers: {
			'Content-Type': 'application/json',
			...options.headers
		},
		...options
	})

	if (!response.ok) {
		const text = await response.text()
		let message = `API error: ${response.status}`
		try {
			const json = JSON.parse(text)
			message = json.message ?? json.error ?? message
		} catch {
			if (text)
				message = `${response.status} - ${text.substring(0, 200)}`
		}

		if ([401, 403, 503].includes(response.status)) {
			throw new AuthRequiredError(message, response.status)
		}
		throw new Error(message)
	}

	// For 204 No Content, return null/undefined as appropriate
	if (response.status === 204) {
		return null as T
	}

	const contentType = response.headers.get('content-type')
	if (!contentType?.includes('application/json')) {
		// Allow non-JSON for specific cases or throw?
		// For now throw to maintain parity, or return text if T allows
		throw new Error(`Expected JSON response, got: ${contentType}`)
	}

	return response.json()
}

export function createClientApiAdapter(baseUrl?: string): StorageAdapter {
	const apiBaseUrl =
		baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')

	async function apiCall<T>(
		endpoint: string,
		options: RequestInit = {}
	): Promise<T> {
		return apiRequest<T>(endpoint, options, apiBaseUrl)
	}

	// Helpers for LocalStorage operations
	const getLocalItems = <T>(key: string): T[] => {
		if (typeof window === 'undefined') return []
		try {
			const item = window.localStorage.getItem(key)
			return item ? JSON.parse(item) : []
		} catch (e) {
			console.warn(`Error reading from localStorage key "${key}":`, e)
			return []
		}
	}

	const setLocalItems = <T>(key: string, items: T[]): void => {
		if (typeof window === 'undefined') return
		try {
			window.localStorage.setItem(key, JSON.stringify(items))
		} catch (e) {
			console.warn(`Error writing to localStorage key "${key}":`, e)
		}
	}

	// Recursive helper to find item location in tree
	const findItemLocation = (items: any[], id: string): { list: any[]; index: number } | null => {
		const index = items.findIndex((i) => i.id === id)
		if (index !== -1) return { list: items, index }

		for (const item of items) {
			if (item.children && Array.isArray(item.children)) {
				const found = findItemLocation(item.children, id)
				if (found) return found
			}
		}
		return null
	}

	return {
		name: 'client-api',
		async create<T>(
			storageKey: string,
			data: any,
			options?: CreateAdapterOptions
		): Promise<T> {
			// If guest user (explicitly marked), use localStorage
			if (options?.userId === 'guest') {
				const items = getLocalItems<any>(storageKey)
				const timestamp = Date.now()
				const newItem = {
					...data,
					// Ensure ID exists (should be passed in data, but fallback if needed)
					id: data.id || `local-${Math.random().toString(36).substr(2, 9)}`,
					createdAt: timestamp,
					updatedAt: timestamp
				}

				if (newItem.parentFolderId) {
					// Find parent folder and add to its children
					const location = findItemLocation(items, newItem.parentFolderId)
					if (location) {
						const parent = location.list[location.index]
						if (!parent.children) parent.children = []
						parent.children.push(newItem)
					} else {
						// Parent not found, fallback to root or error? 
						// Fallback to root for safety
						items.push(newItem)
					}
				} else {
					items.push(newItem)
				}

				setLocalItems(storageKey, items)
				return newItem as T
			}

			const endpoint = getEndpoint(storageKey)
			const body: any = { ...data }

			// Include userId in the body if provided and not 'guest'
			if (options?.userId && options.userId !== 'guest') {
				body.userId = options.userId
			}

			return apiCall<T>(endpoint, {
				method: 'POST',
				body: JSON.stringify(body)
			})
		},

		async read<T>(
			storageKey: string,
			options?: ReadAdapterOptions
		): Promise<T[] | T | undefined> {
			// If guest user (explicitly marked), use localStorage
			// Note: If getById is usually for server, we might still want to check local if no userId
			if (options?.userId === 'guest') {
				const items = getLocalItems<any>(storageKey)

				if (options?.getById) {
					const location = findItemLocation(items, options.getById)
					return (location ? location.list[location.index] : undefined) as T | undefined
				}

				return items as T[]
			}

			const endpoint = getEndpoint(storageKey)
			const params: Record<string, string | null | undefined> = {}

			if (options?.getById) {
				params.id = options.getById
			}
			if (options?.userId && options.userId !== 'guest') {
				params.userId = options.userId
			}

			const url = buildUrl(apiBaseUrl, endpoint, params)

			if (options?.getById) {
				try {
					return await apiCall<T>(url)
				} catch (error) {
					const msg = (error as Error).message?.toLowerCase() ?? ''
					if (msg.includes('404') || msg.includes('not found')) {
						return undefined
					}
					throw error
				}
			}

			return apiCall<T[]>(url)
		},

		async update<T>(
			storageKey: string,
			id: string,
			data: any,
			options?: UpdateAdapterOptions
		): Promise<T | undefined> {
			if (options?.userId === 'guest') {
				const items = getLocalItems<any>(storageKey)
				const location = findItemLocation(items, id)
				if (!location) return undefined

				const updatedItem = {
					...location.list[location.index],
					...data,
					updatedAt: Date.now()
				}
				location.list[location.index] = updatedItem
				setLocalItems(storageKey, items)
				return updatedItem as T
			}

			const endpoint = getEndpoint(storageKey)
			const params: Record<string, string | null | undefined> = {}

			if (options?.userId && options.userId !== 'guest') {
				params.userId = options.userId
			}

			const url = buildUrl(apiBaseUrl, endpoint, params)

			try {
				return await apiCall<T>(url, {
					method: 'PUT',
					body: JSON.stringify({ id, ...data })
				})
			} catch (error) {
				const msg = (error as Error).message?.toLowerCase() ?? ''
				if (msg.includes('404') || msg.includes('not found')) {
					return undefined
				}
				throw error
			}
		},

		async delete(
			storageKey: string,
			id: string,
			options?: DeleteAdapterOptions
		): Promise<boolean> {
			if (options?.userId === 'guest') {
				const items = getLocalItems<any>(storageKey)
				const location = findItemLocation(items, id)
				if (!location) return false // Item not found

				location.list.splice(location.index, 1)
				setLocalItems(storageKey, items)
				return true
			}

			const endpoint = getEndpoint(storageKey)
			const params: Record<string, string | null | undefined> = {
				id
			}

			if (options?.userId && options.userId !== 'guest') {
				params.userId = options.userId
			}

			const url = buildUrl(apiBaseUrl, endpoint, params)

			try {
				await apiCall(url, {
					method: 'DELETE'
				})
				return true
			} catch (error) {
				const msg = (error as Error).message?.toLowerCase() ?? ''
				if (msg.includes('404') || msg.includes('not found')) {
					return false
				}
				throw error
			}
		},

		async readOne<T>(
			storageKey: string,
			id: string,
			options?: ReadAdapterOptions
		): Promise<T | null> {
			if (options?.userId === 'guest') {
				const items = getLocalItems<any>(storageKey)
				const location = findItemLocation(items, id)
				return (location ? location.list[location.index] : null) as T | null
			}

			const endpoint = getEndpoint(storageKey)
			const params: Record<string, string | null | undefined> = {}

			if (options?.userId && options.userId !== 'guest') {
				params.userId = options.userId
			}

			const url = buildUrl(apiBaseUrl, `${endpoint}/${id}`, params)

			try {
				return await apiCall<T>(url)
			} catch (error) {
				const msg = (error as Error).message?.toLowerCase() ?? ''
				if (msg.includes('404') || msg.includes('not found')) {
					return null
				}
				throw error
			}
		},

		async readMany<T>(
			storageKey: string,
			options?: BatchReadAdapterOptions
		): Promise<T[]> {
			if (options?.userId === 'guest') {
				const items = getLocalItems<T>(storageKey)

				// Auto-seed for guest if empty and not seeded
				if (items.length === 0 && (storageKey === 'skriuw:notes' || storageKey === 'notes') && !hasPreseededItems()) {
					const seedItems = generatePreseededItems('guest')
					const treeItems: any[] = []

					// Build tree structure for seed items
					seedItems.forEach((item: any) => {
						const anyItem = item
						// Ensure children array exists for folders
						if (anyItem.type === 'folder' && !anyItem.children) {
							anyItem.children = []
						}

						if (anyItem.parentFolderId) {
							const location = findItemLocation(treeItems, anyItem.parentFolderId)
							if (location) {
								const parent = location.list[location.index]
								if (!parent.children) parent.children = []
								parent.children.push(anyItem)
							} else {
								treeItems.push(anyItem)
							}
						} else {
							treeItems.push(anyItem)
						}
					})

					setLocalItems(storageKey, treeItems)
					markPreseededItems()
					return treeItems as T[]
				}

				return items
			}

			const endpoint = getEndpoint(storageKey)
			const params: Record<string, string | null | undefined> = {}

			if (options?.userId && options.userId !== 'guest') {
				params.userId = options.userId
			}

			const url = buildUrl(apiBaseUrl, endpoint, params)

			try {
				return await apiCall<T[]>(url)
			} catch (error) {
				const msg = (error as Error).message?.toLowerCase() ?? ''
				if (msg.includes('404') || msg.includes('not found')) {
					return []
				}
				throw error
			}
		},

		async batchCreate<T>(
			storageKey: string,
			items: any[],
			options?: BatchCreateAdapterOptions
		): Promise<T[]> {
			if (options?.userId === 'guest') {
				const existingItems = getLocalItems<any>(storageKey)
				const timestamp = Date.now()
				// Batch create for trees is complex. 
				// Assuming batch create is only used for flat initial seeds or similar.
				// If we need to support tree inserts in batch, we'd need to process sequentially.
				// For now, allow simple push to root matches previous behavior, but ideally we should loop and insert.

				const newItems = items.map(item => ({
					...item,
					id: item.id || `local-${Math.random().toString(36).substr(2, 9)}`,
					createdAt: timestamp,
					updatedAt: timestamp
				}))

				// Try to respect parentFolderId if possible by re-reading refined existingItems?
				// For simplicity in batch, we'll traverse for each.
				newItems.forEach(newItem => {
					if (newItem.parentFolderId) {
						const location = findItemLocation(existingItems, newItem.parentFolderId)
						if (location) {
							if (!location.list[location.index].children) location.list[location.index].children = []
							location.list[location.index].children.push(newItem)
						} else {
							existingItems.push(newItem)
						}
					} else {
						existingItems.push(newItem)
					}
				})

				setLocalItems(storageKey, existingItems)
				return newItems as T[]
			}

			const endpoint = getEndpoint(storageKey)
			const body: any = { items }

			if (options?.userId && options.userId !== 'guest') {
				body.userId = options.userId
			}

			return apiCall<T[]>(endpoint, {
				method: 'POST',
				body: JSON.stringify(body)
			})
		},

		async batchRead<T>(
			storageKey: string,
			ids: string[],
			options?: BatchReadAdapterOptions
		): Promise<T[]> {
			if (options?.userId === 'guest') {
				const items = getLocalItems<any>(storageKey)
				// Naive flat filter won't work for tree. Need to find each.
				const results: T[] = []
				for (const id of ids) {
					const location = findItemLocation(items, id)
					if (location) results.push(location.list[location.index] as T)
				}
				return results
			}

			const endpoint = getEndpoint(storageKey)
			const params: Record<string, string | null | undefined> = {
				ids: ids.join(',')
			}

			if (options?.userId && options.userId !== 'guest') {
				params.userId = options.userId
			}

			const url = buildUrl(apiBaseUrl, endpoint, params)

			try {
				return await apiCall<T[]>(url)
			} catch (error) {
				const msg = (error as Error).message?.toLowerCase() ?? ''
				if (msg.includes('404') || msg.includes('not found')) {
					return []
				}
				throw error
			}
		},

		async batchUpdate<T>(
			storageKey: string,
			updates: { id: string; data: any }[],
			options?: BatchUpdateAdapterOptions
		): Promise<T[]> {
			if (options?.userId === 'guest') {
				const items = getLocalItems<any>(storageKey)
				const updatedItems: T[] = []
				let hasChanges = false

				updates.forEach(({ id, data }) => {
					const location = findItemLocation(items, id)
					if (location) {
						const updatedItem = {
							...location.list[location.index],
							...data,
							updatedAt: Date.now()
						}
						location.list[location.index] = updatedItem
						updatedItems.push(updatedItem as T)
						hasChanges = true
					}
				})

				if (hasChanges) {
					setLocalItems(storageKey, items)
				}

				return updatedItems
			}

			const endpoint = getEndpoint(storageKey)
			const body: any = { updates }

			if (options?.userId && options.userId !== 'guest') {
				body.userId = options.userId
			}

			return apiCall<T[]>(endpoint, {
				method: 'PATCH',
				body: JSON.stringify(body)
			})
		},

		async batchDelete(
			storageKey: string,
			ids: string[],
			options?: BatchDeleteAdapterOptions
		): Promise<number> {
			if (options?.userId === 'guest') {
				const items = getLocalItems<any>(storageKey)
				let deletedCount = 0

				// Deleting from tree is tricky if iterating.
				// Simplest way: process each delete.
				for (const id of ids) {
					const location = findItemLocation(items, id)
					if (location) {
						location.list.splice(location.index, 1)
						deletedCount++
					}
				}

				if (deletedCount > 0) {
					setLocalItems(storageKey, items)
				}
				return deletedCount
			}

			const endpoint = getEndpoint(storageKey)
			const params: Record<string, string | null | undefined> = {
				ids: ids.join(',')
			}

			if (options?.userId) {
				params.userId = options.userId
			}

			const url = buildUrl(apiBaseUrl, endpoint, params)

			try {
				await apiCall(url, {
					method: 'DELETE'
				})
				return ids.length
			} catch (error) {
				const msg = (error as Error).message?.toLowerCase() ?? ''
				if (msg.includes('404') || msg.includes('not found')) {
					return 0
				}
				throw error
			}
		}
	}
}
