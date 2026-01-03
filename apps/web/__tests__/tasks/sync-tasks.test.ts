import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	syncTasksToDatabase,
	deleteTasksForNote,
	lastSyncedTasksByNote
} from '../../features/tasks/api/mutations/sync-tasks'
import type { ExtractedTask } from '../../features/notes/utils/extract-tasks'

type MockFetch = ReturnType<typeof vi.fn> & typeof fetch

// Mock fetch globally
const mockFetch = vi.fn() as MockFetch
global.fetch = mockFetch

describe('sync-tasks', () => {
	const mockTasks: ExtractedTask[] = [
		{
			blockId: 'task-1',
			content: 'Task 1',
			checked: false,
			parentTaskId: null,
			position: 0
		},
		{
			blockId: 'task-2',
			content: 'Task 2',
			checked: true,
			parentTaskId: null,
			position: 1
		}
	]

	beforeEach(() => {
		vi.clearAllMocks()
		lastSyncedTasksByNote.clear()
	})

	describe('LRU cache', () => {
		it('should have max size of 1000 entries and TTL of 1 hour', () => {
			expect(lastSyncedTasksByNote.max).toBe(1000)
			expect(lastSyncedTasksByNote.ttl).toBe(3600000)
		})

		it('should cache synced tasks to avoid redundant API calls', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true
			})

			// First sync - should call API
			await syncTasksToDatabase('note-1', mockTasks)
			expect(fetch).toHaveBeenCalledTimes(1)

			// Second sync with same tasks - should NOT call API (cached)
			await syncTasksToDatabase('note-1', mockTasks)
			expect(fetch).toHaveBeenCalledTimes(1)
		})

		it('should call API again when tasks change', async () => {
			mockFetch.mockResolvedValue({
				ok: true
			})

			// First sync
			await syncTasksToDatabase('note-1', mockTasks)
			expect(fetch).toHaveBeenCalledTimes(1)

			// Second sync with different tasks - should call API again
			const changedTasks: ExtractedTask[] = [
				{
					blockId: 'task-1',
					content: 'Task 1',
					checked: true,
					parentTaskId: null,
					position: 0
				},
				{
					blockId: 'task-2',
					content: 'Task 2',
					checked: true,
					parentTaskId: null,
					position: 1
				}
			]
			await syncTasksToDatabase('note-1', changedTasks)
			expect(fetch).toHaveBeenCalledTimes(2)
		})

		it('should enforce max size (1000 entries)', () => {
			// Clear cache
			lastSyncedTasksByNote.clear()

			// Add 1001 entries
			for (let i = 0; i < 1001; i++) {
				const task: ExtractedTask = {
					blockId: `task-${i}`,
					content: `Task ${i}`,
					checked: false,
					parentTaskId: null,
					position: i
				}
				lastSyncedTasksByNote.set(`note-${i}`, JSON.stringify([task]))
			}

			// First entry should be evicted (LRU)
			expect(lastSyncedTasksByNote.has('note-0')).toBe(false)
			expect(lastSyncedTasksByNote.has('note-1')).toBe(true)
			expect(lastSyncedTasksByNote.has('note-1000')).toBe(true)
		})
	})

	describe('deleteTasksForNote', () => {
		it('should remove entry from cache when note is deleted', async () => {
			mockFetch.mockResolvedValue({
				ok: true
			})

			// Sync tasks for note-1
			await syncTasksToDatabase('note-1', mockTasks)
			expect(lastSyncedTasksByNote.has('note-1')).toBe(true)

			// Delete tasks for note-1 - should remove from cache
			await deleteTasksForNote('note-1')
			expect(lastSyncedTasksByNote.has('note-1')).toBe(false)
		})

		it('should call DELETE API endpoint', async () => {
			mockFetch.mockResolvedValue({
				ok: true
			})

			await deleteTasksForNote('note-1')

			expect(fetch).toHaveBeenCalledWith('/api/tasks/note-1', {
				method: 'DELETE'
			})
		})
	})
})
