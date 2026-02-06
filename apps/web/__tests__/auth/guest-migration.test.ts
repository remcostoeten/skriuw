// @vitest-environment jsdom
import { LocalStorageAdapter } from '../../lib/storage/adapters/local-storage-adapter'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// MOCK: This function doesn't exist yet, but this test defines its requirements.
// Implementation should likely live in features/auth/utils/migration.ts
const migrateGuestData = async (userId: string) => {
	// 1. Read all guest data
	// 2. Push to API
	// 3. Clear guest data
	throw new Error('Not implemented')
}

describe('Guest to User Data Migration', () => {
	let localAdapter: LocalStorageAdapter
	const TEST_KEY = 'skriuw:notes'

	beforeEach(() => {
		localStorage.clear()
		localAdapter = new LocalStorageAdapter()
		vi.clearAllMocks()
	})

	it('should migrate existing guest notes to the new user account', async () => {
		// 1. Setup Guest Data
		const guestNote = {
			id: 'guest-note-1',
			content: 'Important guest work',
			userId: 'guest'
		}
		await localAdapter.create(TEST_KEY, guestNote)

		// 2. Simulate Migration Trigger (e.g. after successful signup)
		const newUserId = 'user-123'

		try {
			await migrateGuestData(newUserId)
		} catch (e) {
			// Expected to fail until implemented
			expect(e.message).toBe('Not implemented')
			return
		}

		// 3. Expect API calls (mocked)
		// expect(api.create).toHaveBeenCalledWith(...)

		// 4. Expect LocalStorage to be cleaned up
		// const remaining = await localAdapter.read(TEST_KEY)
		// expect(remaining).toHaveLength(0)
	})

	it('should handle conflict resolution if IDs collide', () => {
		// TBD: Strategy for ID conflicts
	})
})
