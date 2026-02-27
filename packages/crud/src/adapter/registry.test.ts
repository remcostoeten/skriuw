import { describe, it, expect, afterEach } from 'vitest'
import type { StorageAdapter } from '../types/adapter'
import {
	setAdapter,
	getAdapterCapabilities,
	adapterSupportsBackend,
	isPrivacyModeSafeAdapter,
	resetAdapter
} from './registry'

function createMockAdapter(capabilities?: StorageAdapter['capabilities']): StorageAdapter {
	return {
		capabilities,
		async create(_storageKey, data) {
			return {
				id: '1',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				...(data as Record<string, unknown>)
			}
		},
		async read() {
			return []
		},
		async update() {
			return undefined
		},
		async delete() {
			return true
		}
	}
}

describe('adapter registry capabilities helpers', () => {
	afterEach(() => {
		resetAdapter()
	})

	it('returns null when no adapter capabilities are defined', () => {
		setAdapter(createMockAdapter())

		expect(getAdapterCapabilities()).toBeNull()
		expect(adapterSupportsBackend('sqlite')).toBe(false)
		expect(isPrivacyModeSafeAdapter()).toBe(false)
	})

	it('checks backend support and privacy mode using capabilities metadata', () => {
		setAdapter(
			createMockAdapter({
				backends: ['sqlite', 'filesystem'],
				syncMode: 'local-only'
			})
		)

		expect(getAdapterCapabilities()).toEqual({
			backends: ['sqlite', 'filesystem'],
			syncMode: 'local-only'
		})
		expect(adapterSupportsBackend('sqlite')).toBe(true)
		expect(adapterSupportsBackend('remote')).toBe(false)
		expect(isPrivacyModeSafeAdapter()).toBe(true)
	})
})
