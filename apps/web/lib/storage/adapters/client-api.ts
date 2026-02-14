import { ApiAdapter, apiRequest } from './api-adapter'
import { LocalStorageAdapter } from './local-storage-adapter'
import { isGuestUserId } from '@skriuw/shared'
import type {
	StorageAdapter,
	ReadAdapterOptions,
	CreateAdapterOptions,
	UpdateAdapterOptions,
	DeleteAdapterOptions,
	BatchReadAdapterOptions,
	BatchCreateAdapterOptions,
	BatchUpdateAdapterOptions,
	BatchDeleteAdapterOptions,
	BaseEntity
} from './types'

// Re-export common types and helpers for consumers
export type { BaseEntity }
export { apiRequest }
export * from './types'
export { AuthRequiredError } from './api-adapter'

/**
 * Creates a client-side API adapter that routes to either LocalStorage or API
 * based on user authentication state.
 *
 * @param baseUrl - Optional base URL for API requests
 */
/* eslint-disable no-console */

/**
 * Creates a client-side API adapter that routes to either LocalStorage or API
 * based on user authentication state.
 *
 * @param baseUrl - Optional base URL for API requests
 */
export function createClientApiAdapter(baseUrl?: string): StorageAdapter {
	const guestAdapter = new LocalStorageAdapter()
	const apiAdapter = new ApiAdapter(baseUrl)

	return {
		name: 'client-api-strategy',

		async create<T>(key: string, data: any, options?: CreateAdapterOptions): Promise<T> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.create(key, data, options)
			}
			return apiAdapter.create(key, data, options)
		},

		async read<T>(key: string, options?: ReadAdapterOptions): Promise<T[] | T | undefined> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.read(key, options)
			}
			return apiAdapter.read(key, options)
		},

		async readOne<T>(key: string, id: string, options?: ReadAdapterOptions): Promise<T | null> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.readOne(key, id, options)
			}
			return apiAdapter.readOne(key, id, options)
		},

		async readMany<T>(key: string, options?: BatchReadAdapterOptions): Promise<T[]> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.readMany(key, options)
			}
			return apiAdapter.readMany(key, options)
		},

		async update<T>(
			key: string,
			id: string,
			data: any,
			options?: UpdateAdapterOptions
		): Promise<T | undefined> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.update(key, id, data, options)
			}
			return apiAdapter.update(key, id, data, options)
		},

		async delete(key: string, id: string, options?: DeleteAdapterOptions): Promise<boolean> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.delete(key, id, options)
			}
			return apiAdapter.delete(key, id, options)
		},

		async batchCreate<T>(
			key: string,
			items: any[],
			options?: BatchCreateAdapterOptions
		): Promise<T[]> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.batchCreate(key, items, options)
			}
			return apiAdapter.batchCreate(key, items, options)
		},

		async batchRead<T>(
			key: string,
			ids: string[],
			options?: BatchReadAdapterOptions
		): Promise<T[]> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.batchRead(key, ids, options)
			}
			return apiAdapter.batchRead(key, ids, options)
		},

		async batchUpdate<T>(
			key: string,
			updates: { id: string; data: any }[],
			options?: BatchUpdateAdapterOptions
		): Promise<T[]> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.batchUpdate(key, updates, options)
			}
			return apiAdapter.batchUpdate(key, updates, options)
		},

		async batchDelete(
			key: string,
			ids: string[],
			options?: BatchDeleteAdapterOptions
		): Promise<number> {
			const userId = options?.userId
			if (isGuestUserId(userId)) {
				return guestAdapter.batchDelete(key, ids, options)
			}
			return apiAdapter.batchDelete(key, ids, options)
		}
	}
}
