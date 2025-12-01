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

/**
 * Serverless API adapter that calls Vercel serverless functions
 * This allows database operations without running database code in the browser
 */
export function createServerlessApiAdapter(
	baseUrl?: string
): GenericStorageAdapter {
	const listeners: StorageEventListener[] = []
	const apiBaseUrl = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')

	const capabilities: StorageCapabilities = {
		realtime: false,
		offline: false,
		sync: true,
		backup: true,
		versioning: false,
		collaboration: false,
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
		// Use global fetch (available in browsers and modern Node.js)
		const response = await globalThis.fetch(url, {
			headers: {
				'Content-Type': 'application/json',
				...options.headers,
			},
			...options,
		})

		// Read the response body as text first (can only read once)
		const responseText = await response.text()
		const contentType = response.headers.get('content-type')

		if (!response.ok) {
			// Check if error response looks like source code or HTML
			const isSourceCode = responseText.trim().startsWith('import') || responseText.trim().startsWith('export')
			if (isSourceCode) {
				throw new Error(`API connection failed: Received TypeScript source code instead of JSON. This means the Vercel dev server is not running or requests are not being proxied correctly. Please start the Vercel dev server by running 'vercel dev' in the project root, or check your Vite proxy configuration.`)
			}
			if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
				throw new Error(`API endpoint '${endpoint}' returned non-JSON error response. The endpoint may not exist or may be misconfigured. Status: ${response.status}`)
			}
			throw new Error(`API error: ${response.status} - ${responseText.substring(0, 200)}`)
		}
		
		// Check if response is actually JSON
		const isJson = contentType?.includes('application/json')
		
		if (!isJson) {
			// Check if this looks like an error page or source code
			if (responseText.includes('import') || responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
				const isSourceCode = responseText.trim().startsWith('import') || responseText.trim().startsWith('export')
				if (isSourceCode) {
					throw new Error(`API connection failed: Received TypeScript source code instead of JSON. This means the Vercel dev server is not running or requests are not being proxied correctly. Please start the Vercel dev server by running 'vercel dev' in the project root, or check your Vite proxy configuration.`)
				}
				throw new Error(`API endpoint returned non-JSON response. The endpoint '${endpoint}' may not exist or may be misconfigured. Response preview: ${responseText.substring(0, 200)}`)
			}
			throw new Error(`API endpoint returned non-JSON response: ${contentType}`)
		}

		// Try to parse as JSON
		try {
			return JSON.parse(responseText)
		} catch (jsonError) {
			// Check if the response text looks like source code (common error)
			if (responseText.trim().startsWith('import') || responseText.trim().startsWith('export')) {
				throw new Error(`API connection failed: Received TypeScript source code instead of JSON. This means the Vercel dev server is not running or requests are not being proxied correctly. Please start the Vercel dev server by running 'vercel dev' in the project root, or check your Vite proxy configuration.`)
			}
			throw new Error(`API connection failed: Invalid JSON response from '${endpoint}'. ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`)
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
			// Test API connection
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
				const allNotes = await apiCall('/notes')
				const totalItems = Array.isArray(allNotes) ? allNotes.length : 0

				return {
					adapter: 'serverless-api',
					type: 'remote' as StorageAdapterType,
					totalItems,
					isOnline: true,
					capabilities,
				}
			} catch (error) {
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
			if (storageKey === 'Skriuw_notes') {
				const result = await apiCall('/notes', {
					method: 'POST',
					body: JSON.stringify(data),
				})

				const createdNote = {
					...result,
					content: typeof result.content === 'string' ? JSON.parse(result.content) : result.content,
					pinned: result.pinned === 1,
					pinnedAt: result.pinnedAt || undefined,
					favorite: result.favorite === 1,
				} as T

				emit({
					type: 'created',
					storageKey,
					entityId: result.id,
					data: createdNote,
				})

				return createdNote
			}

			throw new Error(`Unsupported storage key: ${storageKey}`)
		},

		async read<T extends BaseEntity>(
			storageKey: string,
			options?: ReadOptions
		): Promise<T[] | T | undefined> {
			if (storageKey === 'Skriuw_notes') {
				const allNotes = await apiCall('/notes')

				const processedNotes = allNotes.map((note: any) => ({
					...note,
					content: typeof note.content === 'string' ? JSON.parse(note.content) : note.content,
					pinned: note.pinned === 1,
					pinnedAt: note.pinnedAt || undefined,
					favorite: note.favorite === 1,
				}))

				// If getById is specified, return single entity
				if (options?.getById) {
					return processedNotes.find((note: T) => (note as any).id === options.getById)
				}

				return processedNotes as T[]
			}

			throw new Error(`Unsupported storage key: ${storageKey}`)
		},

		async update<T extends BaseEntity>(
			storageKey: string,
			id: string,
			data: Partial<T>
		): Promise<T | undefined> {
			if (storageKey === 'Skriuw_notes') {
				const updateData = {
					...data,
					content: (data as any).content ? JSON.stringify((data as any).content) : undefined,
					pinned: (data as any).pinned !== undefined ? ((data as any).pinned ? 1 : 0) : undefined,
					favorite: (data as any).favorite !== undefined ? ((data as any).favorite ? 1 : 0) : undefined,
				}

				const result = await apiCall('/notes', {
					method: 'PUT',
					body: JSON.stringify({ id, ...updateData }),
				})

				const updatedNote = {
					...result,
					content: typeof result.content === 'string' ? JSON.parse(result.content) : result.content,
					pinned: result.pinned === 1,
					pinnedAt: result.pinnedAt || undefined,
					favorite: result.favorite === 1,
				} as T

				emit({
					type: 'updated',
					storageKey,
					entityId: id,
					data: updatedNote,
				})

				return updatedNote
			}

			throw new Error(`Unsupported storage key: ${storageKey}`)
		},

		async delete(storageKey: string, id: string): Promise<boolean> {
			if (storageKey === 'Skriuw_notes') {
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
			return await this.update<T>(storageKey, entityId, {
				parentFolderId: targetParentId as any,
			}) !== undefined
		},
	}

	return adapter
}