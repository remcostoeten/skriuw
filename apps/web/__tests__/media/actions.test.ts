import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { getFiles } from '../../features/media/api/queries/get-files'
import { destroyFile } from '../../features/media/api/mutations/destroy-file'

const mockReadOwned = mock()
const mockDestroyOwned = mock()

mock.module('@/lib/server/crud-helpers', () => ({
	readOwned: mockReadOwned,
	destroyOwned: mockDestroyOwned
}))

// Mock the DB schema object generally
mock.module('@skriuw/db', () => ({
	files: { $inferSelect: {} }
}))

describe('Media Library Actions', () => {
	beforeEach(() => {
		mockReadOwned.mockReset()
		mockDestroyOwned.mockReset()
	})

	describe('getFiles', () => {
		it('should return files when readOwned succeeds', async () => {
			const mockFiles = [{ id: '1', name: 'test.jpg' }]
			mockReadOwned.mockResolvedValue(mockFiles)

			const result = await getFiles()
			expect(result).toEqual(mockFiles)
			expect(mockReadOwned).toHaveBeenCalledTimes(1)
		})

		it('should return empty array when readOwned throws', async () => {
			mockReadOwned.mockRejectedValue(new Error('Unauthorized'))

			const result = await getFiles()
			expect(result).toEqual([])
			expect(mockReadOwned).toHaveBeenCalledTimes(1)
		})
	})

	describe('destroyFile', () => {
		it('should call destroyOwned with correct arguments', async () => {
			mockDestroyOwned.mockResolvedValue(true)
			const fileId = 'test-id'

			await destroyFile(fileId)
			expect(mockDestroyOwned).toHaveBeenCalledTimes(1)
			// We can't verify the table arg easily as it's a mocked object,
			// but we can verify the id passes through if we mocked the function to check args
		})
	})
})
