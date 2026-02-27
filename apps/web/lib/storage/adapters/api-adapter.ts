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
 * Global API request handler with standardized error handling and typing.
 */
/**
 * Global API request handler with standardized error handling and typing.
 */
export async function apiRequest<T>(
	endpoint: string,
	options: RequestInit = {},
	baseUrl?: string
): Promise<T | null> {
	const apiBaseUrl = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')

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
			if (text) message = `${response.status} - ${text.substring(0, 200)}`
		}

		if ([401, 403, 503].includes(response.status)) {
			throw new AuthRequiredError(message, response.status)
		}
		throw new Error(message)
	}

	// For 204 No Content, return null
	if (response.status === 204) {
		return null
	}

	const contentType = response.headers.get('content-type')
	// Relaxed check: Only parse as JSON if content-type says so.
	// If body is empty but status is 200, we might return null or throw.
	// User feedback suggests identifying empty bodies.
	const contentLength = response.headers.get('content-length')
	if (contentLength === '0') {
		return null
	}

	if (!contentType?.includes('application/json')) {
		// If success but not JSON and not empty, this might be an issue.
		// For now we throw as per original, but we handled 204/empty check above.
		throw new Error(`Expected JSON response, got: ${contentType}`)
	}

	return response.json()
}

export class ApiAdapter implements StorageAdapter {
	name = 'api-adapter'
	capabilities: StorageAdapterCapabilities = { backends: ['remote'], syncMode: 'remote-only' }
	private baseUrl: string

	constructor(baseUrl?: string) {
		this.baseUrl = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
	}

	private async apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
		return apiRequest<T>(endpoint, options, this.baseUrl)
	}

	async create<T>(storageKey: string, data: any, options?: CreateAdapterOptions): Promise<T> {
		const endpoint = getEndpoint(storageKey)
		const body: any = { ...data }

		if (options?.userId) {
			body.userId = options.userId
		}

		const result = await this.apiCall<T>(endpoint, {
			method: 'POST',
			body: JSON.stringify(body)
		})
		if (result === null) {
			throw new Error('Create operation returned no data')
		}
		return result
	}

	async read<T>(storageKey: string, options?: ReadAdapterOptions): Promise<T[] | T | undefined> {
		const endpoint = getEndpoint(storageKey)
		const params: Record<string, string | null | undefined> = {}

		if (options?.getById) {
			params.id = options.getById
		}
		if (options?.userId) {
			params.userId = options.userId
		}

		const url = buildUrl(this.baseUrl, endpoint, params)

		if (options?.getById) {
			try {
				const result = await this.apiCall<T>(url)
				return result ?? undefined
			} catch (error) {
				const msg = (error as Error).message?.toLowerCase() ?? ''
				if (msg.includes('404') || msg.includes('not found')) {
					return undefined
				}
				throw error
			}
		}

		const result = await this.apiCall<T[]>(url)
		return result ?? []
	}

	async readOne<T>(
		storageKey: string,
		id: string,
		options?: ReadAdapterOptions
	): Promise<T | null> {
		const endpoint = getEndpoint(storageKey)
		const params: Record<string, string | null | undefined> = {}

		if (options?.userId) {
			params.userId = options.userId
		}

		const url = buildUrl(this.baseUrl, `${endpoint}/${id}`, params)

		try {
			return await this.apiCall<T>(url)
		} catch (error) {
			const msg = (error as Error).message?.toLowerCase() ?? ''
			if (msg.includes('404') || msg.includes('not found')) {
				return null
			}
			throw error
		}
	}

	async readMany<T>(storageKey: string, options?: BatchReadAdapterOptions): Promise<T[]> {
		const endpoint = getEndpoint(storageKey)
		const params: Record<string, string | null | undefined> = {}

		if (options?.userId) {
			params.userId = options.userId
		}

		const url = buildUrl(this.baseUrl, endpoint, params)

		try {
			const result = await this.apiCall<T[]>(url)
			return result ?? []
		} catch (error) {
			const msg = (error as Error).message?.toLowerCase() ?? ''
			if (msg.includes('404') || msg.includes('not found')) {
				return []
			}
			throw error
		}
	}

	async update<T>(
		storageKey: string,
		id: string,
		data: any,
		options?: UpdateAdapterOptions
	): Promise<T | undefined> {
		const endpoint = getEndpoint(storageKey)
		const params: Record<string, string | null | undefined> = {}

		if (options?.userId) {
			params.userId = options.userId
		}

		const url = buildUrl(this.baseUrl, endpoint, params)

		try {
			const result = await this.apiCall<T>(url, {
				method: 'PUT',
				body: JSON.stringify({ id, ...data })
			})
			return result ?? undefined
		} catch (error) {
			const msg = (error as Error).message?.toLowerCase() ?? ''
			if (msg.includes('404') || msg.includes('not found')) {
				return undefined
			}
			throw error
		}
	}

	async delete(storageKey: string, id: string, options?: DeleteAdapterOptions): Promise<boolean> {
		const endpoint = getEndpoint(storageKey)
		const params: Record<string, string | null | undefined> = {
			id
		}

		if (options?.userId) {
			params.userId = options.userId
		}

		const url = buildUrl(this.baseUrl, endpoint, params)

		try {
			await this.apiCall(url, {
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
	}

	async batchCreate<T>(
		storageKey: string,
		items: any[],
		options?: BatchCreateAdapterOptions
	): Promise<T[]> {
		const endpoint = getEndpoint(storageKey)
		const body: any = { items }

		if (options?.userId) {
			body.userId = options.userId
		}

		const result = await this.apiCall<T[]>(endpoint, {
			method: 'POST',
			body: JSON.stringify(body)
		})
		if (result === null) {
			throw new Error('Batch create operation returned no data')
		}
		return result
	}

	async batchRead<T>(
		storageKey: string,
		ids: string[],
		options?: BatchReadAdapterOptions
	): Promise<T[]> {
		const endpoint = getEndpoint(storageKey)
		const params: Record<string, string | null | undefined> = {
			ids: ids.join(',')
		}

		if (options?.userId) {
			params.userId = options.userId
		}

		const url = buildUrl(this.baseUrl, endpoint, params)

		try {
			const result = await this.apiCall<T[]>(url)
			return result ?? []
		} catch (error) {
			const msg = (error as Error).message?.toLowerCase() ?? ''
			if (msg.includes('404') || msg.includes('not found')) {
				return []
			}
			throw error
		}
	}

	async batchUpdate<T>(
		storageKey: string,
		updates: { id: string; data: any }[],
		options?: BatchUpdateAdapterOptions
	): Promise<T[]> {
		const endpoint = getEndpoint(storageKey)
		const body: any = { updates }

		if (options?.userId) {
			body.userId = options.userId
		}

		const result = await this.apiCall<T[]>(endpoint, {
			method: 'PATCH',
			body: JSON.stringify(body)
		})
		if (result === null) {
			throw new Error('Batch update operation returned no data')
		}
		return result
	}

	async batchDelete(
		storageKey: string,
		ids: string[],
		options?: BatchDeleteAdapterOptions
	): Promise<number> {
		const endpoint = getEndpoint(storageKey)
		const params: Record<string, string | null | undefined> = {
			ids: ids.join(',')
		}

		if (options?.userId) {
			params.userId = options.userId
		}

		const url = buildUrl(this.baseUrl, endpoint, params)

		try {
			await this.apiCall(url, {
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
