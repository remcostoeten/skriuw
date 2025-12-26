/**
 * @fileoverview Hybrid Storage Adapter for Zero-Session Architecture
 * @description Switches between localStorage (zero-session) and API (authenticated/anonymous)
 */

import { createLocalStorageAdapter } from './local-storage'
import { createClientApiAdapter } from './client-api'
import { isZeroSessionUser } from '../../zero-session-manager'
import type { StorageAdapter, BaseEntity } from '@skriuw/crud'

export function createHybridAdapter(baseUrl?: string): StorageAdapter {
	const localStorageAdapter = createLocalStorageAdapter()
	const apiAdapter = createClientApiAdapter(baseUrl)

	return {
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
		}
	}
}
