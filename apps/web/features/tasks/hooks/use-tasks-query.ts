import type { Task, TaskWithNote } from '../types'
import type { ExtractedTask } from '@/features/notes/utils/extract-tasks'
import { useSession } from '@/lib/auth-client'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { readMany, create, update, destroy, batchCreate, batchDestroy } from '@skriuw/crud'
import { GUEST_USER_ID, generateId, isGuestUserId } from '@skriuw/shared'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export const tasksKeys = {
	all: ['tasks'] as const,
	lists: () => [...tasksKeys.all, 'list'] as const,
	list: (userId?: string | null) => [...tasksKeys.lists(), userId ?? 'all'] as const,
	note: (noteId: string, userId?: string | null) =>
		[...tasksKeys.all, 'note', noteId, userId ?? 'all'] as const,
	details: () => [...tasksKeys.all, 'detail'] as const,
	detail: (taskId: string) => [...tasksKeys.details(), taskId] as const,
	task: (blockId: string) => [...tasksKeys.all, 'block', blockId] as const
}

function isGuest(userId?: string | null): boolean {
	return !userId || isGuestUserId(userId)
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		headers: {
			'Content-Type': 'application/json'
		},
		...options
	})

	if (!response.ok) {
		const errorBody = await response.json().catch(() => ({}))
		throw new Error(errorBody?.error ?? `Request failed: ${response.status}`)
	}

	return response.json() as Promise<T>
}

// Helper to filter tasks by noteId when using LocalStorage (which returns all tasks)
async function getTasksForNoteLocal(noteId: string, userId: string): Promise<TaskWithNote[]> {
	const allTasks = await readMany<Task>(STORAGE_KEYS.TASKS, { userId })
	// We map to TaskWithNote structure. For local notes, we might not have noteName easily available
	// without reading the note title, but for simple task lists it might be acceptable to omit or fetch note separately.
	// For now, let's just return tasks.
	if (!allTasks.success || !allTasks.data) return []

	// Sort by position or createdAt if position missing?
	// The API sorts by updatedAt desc usually, or position asc?
	// API Route says: orderBy(desc(tasks.updatedAt))

	return (allTasks.data as Task[])
		.filter((t) => t.noteId === noteId)
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.map((t) => ({
			...t,
			noteName: null, // Populating this would require reading note
			userId
		}))
}

export function useTasksQuery(noteId: string | null) {
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useQuery({
		queryKey: tasksKeys.note(noteId ?? '', userId),
		enabled: !!noteId,
		queryFn: async () => {
			if (!noteId) return []

			if (isGuest(userId)) {
				return getTasksForNoteLocal(noteId, userId)
			}

			return request<TaskWithNote[]>(`/api/tasks/${encodeURIComponent(noteId)}`)
		},
		staleTime: 1000 * 60
	})
}

export function useAllTasksQuery() {
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useQuery({
		queryKey: tasksKeys.list(userId),
		queryFn: async () => {
			if (isGuest(userId)) {
				// In Guest mode, get all tasks from storage
				const result = await readMany<Task>(STORAGE_KEYS.TASKS, { userId })
				if (!result.success || !result.data) return []
				return (result.data as Task[]).map((t) => ({
					...t,
					noteName: null,
					userId
				}))
			}
			return request<TaskWithNote[]>('/api/tasks')
		},
		staleTime: 1000 * 60
	})
}

export function useTaskByIdQuery(taskId: string | null) {
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useQuery({
		queryKey: tasksKeys.detail(taskId ?? ''),
		enabled: !!taskId,
		queryFn: async () => {
			if (!taskId) return null

			if (isGuest(userId)) {
				// LocalStorage read
				// Use readOne from CRUD? But readOne typically wants just ID, crud layer handles key
				// Wait, readOne(storageKey, id, options)
				// But adapter implementation of readOne does getById
				// Let's use readMany and find? Or just implement readOne properly in crud wrapper if needed.
				// Actually client-api adapter supports readOne.
				const result = await readMany<Task>(STORAGE_KEYS.TASKS, { userId })
				const task = (result.data as Task[] | undefined)?.find(
					(t) => t.id === taskId || t.blockId === taskId
				)
				if (!task) return null
				return { ...task, noteName: null, userId }
			}

			return request<TaskWithNote>(`/api/tasks/item/${encodeURIComponent(taskId)}`)
		},
		staleTime: 1000 * 30
	})
}

export function useUpdateTaskMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useMutation({
		mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
			if (isGuest(userId)) {
				const result = await update<Task>(STORAGE_KEYS.TASKS, taskId, updates, { userId })
				if (!result.success || !result.data) throw new Error('Failed to update task')
				return result.data
			}

			return request<Task>(`/api/tasks/item/${encodeURIComponent(taskId)}`, {
				method: 'PATCH',
				body: JSON.stringify(updates)
			})
		},
		onMutate: async ({ taskId, updates }) => {
			await queryClient.cancelQueries({ queryKey: tasksKeys.detail(taskId) })
			await queryClient.cancelQueries({ queryKey: tasksKeys.list(userId) })

			const previousTask = queryClient.getQueryData<Task>(tasksKeys.detail(taskId))
			const previousList = queryClient.getQueryData<Task[]>(tasksKeys.list(userId))

			if (previousTask) {
				queryClient.setQueryData<Task>(tasksKeys.detail(taskId), {
					...previousTask,
					...updates
				})
			}
			if (previousList) {
				queryClient.setQueryData<Task[]>(
					tasksKeys.list(userId),
					previousList.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
				)
			}

			return { previousTask, previousList }
		},
		onError: (_err, { taskId }, context) => {
			if (context?.previousTask) {
				queryClient.setQueryData(tasksKeys.detail(taskId), context.previousTask)
			}
			if (context?.previousList) {
				queryClient.setQueryData(tasksKeys.list(userId), context.previousList)
			}
		},
		onSettled: (_data, _error, { taskId }) => {
			queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) })
			queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
		}
	})
}

export function useDeleteTaskMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useMutation({
		mutationFn: async (taskId: string) => {
			if (isGuest(userId)) {
				await destroy(STORAGE_KEYS.TASKS, taskId, { userId })
				return taskId
			}

			await request(`/api/tasks/item/${encodeURIComponent(taskId)}`, {
				method: 'DELETE'
			})
			return taskId
		},
		onMutate: async (taskId) => {
			await queryClient.cancelQueries({ queryKey: tasksKeys.list(userId) })
			const previousList = queryClient.getQueryData<Task[]>(tasksKeys.list(userId))

			if (previousList) {
				queryClient.setQueryData<Task[]>(
					tasksKeys.list(userId),
					previousList.filter((t) => t.id !== taskId)
				)
			}

			return { previousList }
		},
		onError: (_err, _taskId, context) => {
			if (context?.previousList) {
				queryClient.setQueryData(tasksKeys.list(userId), context.previousList)
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
		}
	})
}

export function useTaskQuery(noteId: string, blockId: string) {
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useQuery({
		queryKey: tasksKeys.task(blockId),
		enabled: !!noteId && !!blockId,
		queryFn: async () => {
			if (isGuest(userId)) {
				const result = await readMany<Task>(STORAGE_KEYS.TASKS, { userId })
				// Filter by noteId AND blockId
				const task = (result.data as Task[] | undefined)?.find(
					(t) => t.noteId === noteId && t.blockId === blockId
				)
				return task || null
			}

			return request<Task | null>(
				`/api/tasks/${encodeURIComponent(noteId)}?blockId=${encodeURIComponent(blockId)}`
			)
		}
	})
}

export function useSyncTasksMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useMutation({
		mutationFn: async ({ noteId, tasks }: { noteId: string; tasks: ExtractedTask[] }) => {
			if (!noteId) return

			// If Guest, we need to manually reconcile tasks in LocalStorage
			if (isGuest(userId)) {
				// 1. Get existing tasks for this note
				const existing = await getTasksForNoteLocal(noteId, userId)
				const taskIdByBlockId = new Map(existing.map((t) => [t.blockId, t.id]))

				// 2. Map extracted tasks to Task objects
				const now = Date.now()
				const newTasks: Partial<Task>[] = tasks.map((t) => {
					// Try to find existing task to keep ID stable if possible?
					// The extracted task has blockId. We should match on blockId.
					const match = existing.find((e) => e.blockId === t.blockId)
					const id = match?.id ?? generateId(`${noteId}-${t.blockId}-`)
					taskIdByBlockId.set(t.blockId, id)
					const mappedParentId = t.parentTaskId ? taskIdByBlockId.get(t.parentTaskId) : null
					const resolvedParentTaskId = mappedParentId ?? t.parentTaskId ?? null

					return {
						id,
						noteId,
						userId,
						blockId: t.blockId,
						content: t.content,
						checked: t.checked ? 1 : 0,
						position: t.position,
						parentTaskId: resolvedParentTaskId,
						description: null, // extracted tasks might not have description yet
						updatedAt: now,
						createdAt: match?.createdAt || now
					}
				})

				// 3. For guest local storage, simplest "Sync" is:
				//    - Upsert tasks (update if exists, create if not)
				//    - Delete tasks that are no longer in the extracted list?
				//    Actually `syncTasksToDatabase` usually implies a full sync for that note.
				//    But the backend logic might be smarter.
				//    Ideally we DELETE existing for note, then INSERT all new.
				//    Lets try that for simplicity and correctness of "Sync".

				const existingIds = existing.map((e) => e.id)
				if (existingIds.length > 0) {
					await batchDestroy(STORAGE_KEYS.TASKS, existingIds, { userId })
				}

				if (newTasks.length > 0) {
					await batchCreate(STORAGE_KEYS.TASKS, newTasks, { userId })
				}

				return
			}

			await request('/api/tasks/sync', {
				method: 'POST',
				body: JSON.stringify({
					noteId,
					tasks
				})
			})
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: tasksKeys.note(variables.noteId, userId) })
		},
		onError: (error) => {
			console.error('Failed to sync tasks:', error)
		}
	})
}

export function useDeleteTasksMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useMutation({
		mutationFn: async (noteId: string) => {
			if (!noteId) return

			if (isGuest(userId)) {
				const existing = await getTasksForNoteLocal(noteId, userId)
				const ids = existing.map((e) => e.id)
				if (ids.length > 0) {
					await batchDestroy(STORAGE_KEYS.TASKS, ids, { userId })
				}
				return
			}

			await request(`/api/tasks/${encodeURIComponent(noteId)}`, {
				method: 'DELETE'
			})
		},
		onSuccess: (_, noteId) => {
			queryClient.invalidateQueries({ queryKey: tasksKeys.note(noteId, userId) })
		}
	})
}

// -----------------------------------------------------------------------------
// Backward-compatible helper functions for legacy code
// These can be used by non-hook code (like server actions or API routes)
// -----------------------------------------------------------------------------

/**
 * Delete all tasks for a note (for use outside of React components)
 */
export async function deleteTasksForNote(noteId: string): Promise<void> {
	if (!noteId) return
	// Note: This helper cannot easily detect Guest vs User without session context passed in.
	// Assuming API usage for now as it's legacy/server-side likely.

	await request(`/api/tasks/${encodeURIComponent(noteId)}`, {
		method: 'DELETE'
	})
}

/**
 * Sync tasks to database (for use outside of React components)
 */
export async function syncTasksToDatabase(noteId: string, tasks: ExtractedTask[]): Promise<void> {
	if (!noteId) return
	await request('/api/tasks/sync', {
		method: 'POST',
		body: JSON.stringify({ noteId, tasks })
	})
}
