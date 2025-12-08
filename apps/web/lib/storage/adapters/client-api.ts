/**
 * @fileoverview Client API Adapter for @skriuw/crud
 * @description Implements StorageAdapter interface for browser-to-API communication
 */

import type { StorageAdapter, BaseEntity, ReadAdapterOptions } from '@skriuw/crud'

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
    'skriuw:shortcuts:custom': '/api/shortcuts',
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
 * Creates a client-side API adapter for @skriuw/crud
 *
 * @param baseUrl - Optional base URL (defaults to window.location.origin)
 */
export function createClientApiAdapter(baseUrl?: string): StorageAdapter {
    const apiBaseUrl = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')

    async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${apiBaseUrl}${endpoint}`
        const response = await globalThis.fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
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
                body: JSON.stringify(data),
            })
        },

        async read<T extends BaseEntity>(
            storageKey: string,
            options?: ReadAdapterOptions
        ): Promise<T[] | T | undefined> {
            const endpoint = getEndpoint(storageKey)

            if (options?.getById) {
                try {
                    return await apiCall<T>(`${endpoint}?id=${encodeURIComponent(options.getById)}`)
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
                    body: JSON.stringify({ id, ...data }),
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
                    method: 'DELETE',
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
    }
}
