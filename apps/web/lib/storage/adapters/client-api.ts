/**
 * @fileoverview Client API Adapter for @skriuw/crud
 * @description Implements StorageAdapter interface for browser-to-API communication.
 * Supports user-scoped operations via userId parameter.
 */

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
export function createClientApiAdapter(baseUrl?: string): StorageAdapter {
	const apiBaseUrl =
		baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')

	async function apiCall<T>(
		endpoint: string,
		options: RequestInit = {}
	): Promise<T> {
		const url = endpoint.startsWith('http')
			? endpoint
			: `${apiBaseUrl}${endpoint}`
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

		const contentType = response.headers.get('content-type')
		if (!contentType?.includes('application/json')) {
			throw new Error(`Expected JSON response, got: ${contentType}`)
		}

		return response.json()
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
				items.push(newItem)
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
					const item = items.find(i => i.id === options.getById)
					return item as T | undefined
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
				const index = items.findIndex(i => i.id === id)
				if (index === -1) return undefined

				const updatedItem = {
					...items[index],
					...data,
					updatedAt: Date.now()
				}
				items[index] = updatedItem
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
				const newItems = items.filter(i => i.id !== id)
				if (newItems.length === items.length) return false // Item not found
				setLocalItems(storageKey, newItems)
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
				const item = items.find(i => i.id === id)
				return (item as T) || null
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
				return getLocalItems<T>(storageKey)
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
				const newItems = items.map(item => ({
					...item,
					id: item.id || `local-${Math.random().toString(36).substr(2, 9)}`,
					createdAt: timestamp,
					updatedAt: timestamp
				}))
				setLocalItems(storageKey, [...existingItems, ...newItems])
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
				return items.filter(i => ids.includes(i.id)) as T[]
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
					const index = items.findIndex(i => i.id === id)
					if (index !== -1) {
						items[index] = { ...items[index], ...data, updatedAt: Date.now() }
						updatedItems.push(items[index] as T)
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
				const newItems = items.filter(i => !ids.includes(i.id))
				const deletedCount = items.length - newItems.length

				if (deletedCount > 0) {
					setLocalItems(storageKey, newItems)
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
