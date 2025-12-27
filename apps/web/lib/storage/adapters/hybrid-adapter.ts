/**
 * @fileoverview Hybrid Storage Adapter for Zero-Session Architecture
 * @description Switches between localStorage (zero-session) and API (authenticated/anonymous)
 */

import { createLocalStorageAdapter } from './local-storage'
import { createClientApiAdapter } from './client-api'
import { isZeroSessionUser } from '../../zero-session-manager'

// Define types locally since crud package has issues
type BaseEntity = {
	id: string
} & {
	createdAt: number
	updatedAt: number
	deletedAt?: number
}

interface StorageAdapter {
	name: string
	read<T>(key: string, options?: any): Promise<T[] | T | undefined>
	readOne<T>(key: string, id: string, options?: any): Promise<T | null>
	readMany<T>(key: string, options?: any): Promise<T[]>
	create<T>(key: string, data: any, options?: any): Promise<T>
	update<T>(key: string, id: string, data: any, options?: any): Promise<T | undefined>
	delete(key: string, id: string, options?: any): Promise<boolean>
	batchCreate<T>(key: string, items: any[], options?: any): Promise<T[]>
	batchRead<T>(key: string, ids: string[], options?: any): Promise<T[]>
	batchUpdate<T>(key: string, updates: { id: string; data: any }[], options?: any): Promise<T[]>
	batchDelete(key: string, ids: string[], options?: any): Promise<number>
}

export function createHybridAdapter(baseUrl?: string): StorageAdapter {
	const localStorageAdapter = createLocalStorageAdapter()
	const apiAdapter = createClientApiAdapter(baseUrl)

	return {
		name: 'hybrid',
		create: async <T extends BaseEntity>(
			key: string,
			data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
		) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.create(key, data)
			}
			return apiAdapter.create(key, data)
		},
		read: async <T extends BaseEntity>(key: string, options?: any) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.read(key, options)
			}
			return apiAdapter.read(key, options)
		},
		update: async <T extends BaseEntity>(key: string, id: string, data: Partial<T>) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.update(key, id, data)
			}
			return apiAdapter.update(key, id, data)
		},
		delete: async (key: string, id: string) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.delete(key, id)
			}
			return apiAdapter.delete(key, id)
		},
		readOne: async <T>(key: string, id: string, options?: any) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.readOne(key, id, options)
			}
			return apiAdapter.readOne(key, id, options)
		},
		readMany: async <T>(key: string, options?: any) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.readMany(key, options)
			}
			return apiAdapter.readMany(key, options)
		},
		batchCreate: async <T>(key: string, items: any[], options?: any) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.batchCreate(key, items, options)
			}
			return apiAdapter.batchCreate(key, items, options)
		},
		batchRead: async <T>(key: string, ids: string[], options?: any) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.batchRead(key, ids, options)
			}
			return apiAdapter.batchRead(key, ids, options)
		},
		batchUpdate: async <T>(key: string, updates: { id: string; data: any }[], options?: any) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.batchUpdate(key, updates, options)
			}
			return apiAdapter.batchUpdate(key, updates, options)
		},
		batchDelete: async (key: string, ids: string[], options?: any) => {
			if (isZeroSessionUser()) {
				return localStorageAdapter.batchDelete(key, ids, options)
			}
			return apiAdapter.batchDelete(key, ids, options)
		}
	}
}
