/**
 * @fileoverview Client API Adapter for @skriuw/crud
 * @description Implements StorageAdapter interface for browser-to-API communication.
 * Supports user-scoped operations via userId parameter.
 */

import type {
    StorageAdapter,
    ReadAdapterOptions,
    CreateAdapterOptions,
    UpdateAdapterOptions,
    DeleteAdapterOptions,
    BaseEntity
} from '@skriuw/crud'

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
 * Builds URL with query parameters, including userId if provided.
 */
function buildUrl(baseUrl: string, endpoint: string, params?: Record<string, string | null | undefined>): string {
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
    const apiBaseUrl = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')

    async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = endpoint.startsWith('http') ? endpoint : `${apiBaseUrl}${endpoint}`
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

            if ([401, 403, 503].includes(response.status)) {
                if (typeof window !== 'undefined') {
                    const event = new CustomEvent('skriuw:auth-required', {
                        detail: { status: response.status, message },
                    })
                    window.dispatchEvent(event)
                }
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

    return {
        async create<T extends BaseEntity>(
            storageKey: string,
            data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
            options?: CreateAdapterOptions
        ): Promise<T> {
            const endpoint = getEndpoint(storageKey)
            const body: any = { ...data }

            // Include userId in the body if provided
            if (options?.userId) {
                body.userId = options.userId
            }

            return apiCall<T>(endpoint, {
                method: 'POST',
                body: JSON.stringify(body),
            })
        },

        async read<T extends BaseEntity>(
            storageKey: string,
            options?: ReadAdapterOptions
        ): Promise<T[] | T | undefined> {
            const endpoint = getEndpoint(storageKey)
            const params: Record<string, string | null | undefined> = {}

            if (options?.getById) {
                params.id = options.getById
            }
            if (options?.userId) {
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

        async update<T extends BaseEntity>(
            storageKey: string,
            id: string,
            data: Partial<T>,
            options?: UpdateAdapterOptions
        ): Promise<T | undefined> {
            const endpoint = getEndpoint(storageKey)
            const params: Record<string, string | null | undefined> = {}

            if (options?.userId) {
                params.userId = options.userId
            }

            const url = buildUrl(apiBaseUrl, endpoint, params)

            try {
                return await apiCall<T>(url, {
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

        async delete(
            storageKey: string,
            id: string,
            options?: DeleteAdapterOptions
        ): Promise<boolean> {
            const endpoint = getEndpoint(storageKey)
            const params: Record<string, string | null | undefined> = {
                id,
            }

            if (options?.userId) {
                params.userId = options.userId
            }

            const url = buildUrl(apiBaseUrl, endpoint, params)

            try {
                await apiCall(url, {
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
