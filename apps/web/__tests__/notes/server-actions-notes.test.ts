import { describe, it, expect, beforeEach, vi } from 'vitest'
import { STORAGE_KEYS } from '../../lib/storage-keys'
import { createClientApiAdapter } from '../../lib/storage/adapters/client-api'
import { ApiAdapter } from '../../lib/storage/adapters/api-adapter'
import { LocalStorageAdapter } from '../../lib/storage/adapters/local-storage-adapter'

describe('notes server-action fetch path prep', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('uses guest fallback and does not call authenticated fetch action', async () => {
		const guestNotes = [{ id: 'guest-note-1', type: 'note' }]
		const guestReadManySpy = vi
			.spyOn(LocalStorageAdapter.prototype, 'readMany')
			.mockResolvedValue(guestNotes)
		const apiReadManySpy = vi
			.spyOn(ApiAdapter.prototype, 'readMany')
			.mockResolvedValue([{ id: 'user-note-1', type: 'note' }])

		const adapter = createClientApiAdapter()
		const result = await adapter.readMany(STORAGE_KEYS.NOTES, { userId: 'guest-user' })

		expect(result).toEqual(guestNotes)
		expect(guestReadManySpy).toHaveBeenCalledTimes(1)
		expect(guestReadManySpy).toHaveBeenCalledWith(STORAGE_KEYS.NOTES, {
			userId: 'guest-user'
		})
		expect(apiReadManySpy).not.toHaveBeenCalled()
	})

	it('calls authenticated notes fetch action path for signed-in users', async () => {
		const userNotes = [{ id: 'user-note-1', type: 'note' }]
		const apiReadManySpy = vi.spyOn(ApiAdapter.prototype, 'readMany').mockResolvedValue(userNotes)
		const guestReadManySpy = vi
			.spyOn(LocalStorageAdapter.prototype, 'readMany')
			.mockResolvedValue([{ id: 'guest-note-1', type: 'note' }])

		const adapter = createClientApiAdapter()
		const result = await adapter.readMany(STORAGE_KEYS.NOTES, { userId: 'user-123' })

		expect(result).toEqual(userNotes)
		expect(apiReadManySpy).toHaveBeenCalledTimes(1)
		expect(apiReadManySpy).toHaveBeenCalledWith(STORAGE_KEYS.NOTES, {
			userId: 'user-123'
		})
		expect(guestReadManySpy).not.toHaveBeenCalled()
	})
})
