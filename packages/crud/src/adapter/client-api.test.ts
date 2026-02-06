import { BaseEntity, StorageAdapter } from '../types'
import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'

// Inline implementation of the client-api adapter for testing
// This mirrors the actual implementation in apps/web/lib/storage/adapters/client-api.ts

type EndpointMap = {
	[key: string]: string
}

const ENDPOINT_MAP: EndpointMap = {
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

function getEndpoint(storageKey: string): string {
	const normalized = storageKey.toLowerCase()
	const endpoint = ENDPOINT_MAP[normalized]
	if (!endpoint) {
		return `/api/${storageKey.split(':').pop() ?? storageKey}`
	}
	return endpoint
}

describe('Client API Adapter', () => {
	describe('Storage Key Mapping', () => {
		it('should map "Skriuw_notes" (mixed case) to /api/notes', () => {
			expect(getEndpoint('Skriuw_notes')).toBe('/api/notes')
		})

		it('should map "skriuw_notes" (lowercase) to /api/notes', () => {
			expect(getEndpoint('skriuw_notes')).toBe('/api/notes')
		})

		it('should map "notes" to /api/notes', () => {
			expect(getEndpoint('notes')).toBe('/api/notes')
		})

		it('should map "skriuw:notes" to /api/notes', () => {
			expect(getEndpoint('skriuw:notes')).toBe('/api/notes')
		})

		it('should map "folders" to /api/notes (same endpoint)', () => {
			expect(getEndpoint('folders')).toBe('/api/notes')
		})

		it('should map "tasks" to /api/tasks', () => {
			expect(getEndpoint('tasks')).toBe('/api/tasks')
		})

		it('should map "settings" to /api/settings', () => {
			expect(getEndpoint('settings')).toBe('/api/settings')
		})

		it('should map "shortcuts" to /api/shortcuts', () => {
			expect(getEndpoint('shortcuts')).toBe('/api/shortcuts')
		})

		it('should handle unknown storage keys by extracting last segment', () => {
			expect(getEndpoint('custom:storage:users')).toBe('/api/users')
			expect(getEndpoint('myapp:items')).toBe('/api/items')
		})

		it('should handle simple unknown keys', () => {
			expect(getEndpoint('unknownKey')).toBe('/api/unknownKey')
		})
	})

	describe('Mock Fetch Adapter', () => {
		let mockFetch: ReturnType<typeof vi.fn>
		let originalFetch: typeof globalThis.fetch
		type NoteEntity = BaseEntity & { name: string; type: string; content: unknown[] }

		beforeAll(() => {
			originalFetch = globalThis.fetch
		})

		afterAll(() => {
			globalThis.fetch = originalFetch
		})

		beforeEach(() => {
			mockFetch = vi.fn()
			globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
		})

		function createAdapter(baseUrl: string = ''): StorageAdapter {
			const apiBaseUrl = baseUrl

			async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
				const url = `${apiBaseUrl}${endpoint}`
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
					throw new Error(message)
				}

				const contentType = response.headers.get('content-type')
				if (!contentType?.includes('application/json')) {
					throw new Error(`Expected JSON response, got: ${contentType}`)
				}

				return response.json()
			}

			return {
				async create<T extends BaseEntity>(
					storageKey: string,
					data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
				): Promise<T> {
					const endpoint = getEndpoint(storageKey)
					return apiCall<T>(endpoint, {
						method: 'POST',
						body: JSON.stringify(data)
					})
				},

				async read<T extends BaseEntity>(
					storageKey: string,
					options?: { getById?: string; getAll?: boolean }
				): Promise<T[] | T | undefined> {
					const endpoint = getEndpoint(storageKey)

					if (options?.getById) {
						try {
							return await apiCall<T>(
								`${endpoint}?id=${encodeURIComponent(options.getById)}`
							)
						} catch (error) {
							const msg = (error as Error).message?.toLowerCase() ?? ''
							if (msg.includes('404') || msg.includes('not found')) {
								return undefined
							}
							throw error
						}
					}

					return apiCall<T[]>(endpoint)
				},

				async update<T extends BaseEntity>(
					storageKey: string,
					id: string,
					data: Partial<T>
				): Promise<T | undefined> {
					const endpoint = getEndpoint(storageKey)
					try {
						return await apiCall<T>(endpoint, {
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

				async delete(storageKey: string, id: string): Promise<boolean> {
					const endpoint = getEndpoint(storageKey)
					try {
						await apiCall(`${endpoint}?id=${encodeURIComponent(id)}`, {
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
			}
		}

		it('should call correct endpoint for readMany with Skriuw_notes', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => [{ id: '1', name: 'Test Note', type: 'note' }]
			})

			const adapter = createAdapter('http://localhost:3000')
			const result = await adapter.read('Skriuw_notes', { getAll: true })

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/notes',
				expect.objectContaining({
					headers: expect.objectContaining({
						'Content-Type': 'application/json'
					})
				})
			)
			expect(result).toEqual([{ id: '1', name: 'Test Note', type: 'note' }])
		})

		it('should call correct endpoint for readOne with Skriuw_notes', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => ({ id: 'note-123', name: 'Test Note', type: 'note' })
			})

			const adapter = createAdapter('http://localhost:3000')
			const result = await adapter.read('Skriuw_notes', { getById: 'note-123' })

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/notes?id=note-123',
				expect.objectContaining({
					headers: expect.objectContaining({
						'Content-Type': 'application/json'
					})
				})
			)
			expect(result).toEqual({ id: 'note-123', name: 'Test Note', type: 'note' })
		})

		it('should handle 404 responses for readOne gracefully', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				headers: new Headers({ 'content-type': 'application/json' }),
				text: async () => JSON.stringify({ error: 'Item not found' })
			})

			const adapter = createAdapter('http://localhost:3000')
			const result = await adapter.read('Skriuw_notes', { getById: 'nonexistent' })

			expect(result).toBeUndefined()
		})

		it('should throw on non-JSON responses', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'text/html' }),
				json: async () => ({})
			})

			const adapter = createAdapter('http://localhost:3000')

			await expect(adapter.read('Skriuw_notes', { getAll: true })).rejects.toThrow(
				'Expected JSON response'
			)
		})

		it('should send POST with correct body for create', async () => {
			const now = Date.now()
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => ({
					id: 'new-note',
					name: 'New Note',
					type: 'note',
					content: [],
					createdAt: now,
					updatedAt: now
				})
			})

			const adapter = createAdapter('http://localhost:3000')
			await adapter.create<NoteEntity>('Skriuw_notes', {
				name: 'New Note',
				type: 'note',
				content: []
			})

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/notes',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ name: 'New Note', type: 'note', content: [] })
				})
			)
		})

		it('should send PUT with id in body for update', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => ({ id: 'note-123', name: 'Updated Note' })
			})

			const adapter = createAdapter('http://localhost:3000')
			await adapter.update<NoteEntity>('Skriuw_notes', 'note-123', { name: 'Updated Note' })

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/notes',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ id: 'note-123', name: 'Updated Note' })
				})
			)
		})

		it('should send DELETE with id in query params', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => ({ success: true })
			})

			const adapter = createAdapter('http://localhost:3000')
			const result = await adapter.delete('Skriuw_notes', 'note-123')

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/notes?id=note-123',
				expect.objectContaining({
					method: 'DELETE'
				})
			)
			expect(result).toBe(true)
		})
	})
})
