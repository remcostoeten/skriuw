import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Task } from '../types'
import type { ExtractedTask } from '@/features/notes/utils/extract-tasks'

export const tasksKeys = {
    all: ['tasks'] as const,
    lists: () => [...tasksKeys.all, 'list'] as const,
    list: () => [...tasksKeys.lists(), 'all'] as const,
    note: (noteId: string) => [...tasksKeys.all, 'note', noteId] as const,
    details: () => [...tasksKeys.all, 'detail'] as const,
    detail: (taskId: string) => [...tasksKeys.details(), taskId] as const,
    task: (blockId: string) => [...tasksKeys.all, 'block', blockId] as const,
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
        },
        ...options
    })

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        throw new Error(errorBody?.error ?? `Request failed: ${response.status}`)
    }

    return response.json() as Promise<T>
}

export function useTasksQuery(noteId: string | null) {
    return useQuery({
        queryKey: tasksKeys.note(noteId ?? ''),
        enabled: !!noteId,
        queryFn: async () => {
            if (!noteId) return []
            return request<Task[]>(`/api/tasks/${encodeURIComponent(noteId)}`)
        },
        staleTime: 1000 * 60,
    })
}

export function useAllTasksQuery() {
    return useQuery({
        queryKey: tasksKeys.list(),
        queryFn: async () => {
            return request<Task[]>('/api/tasks')
        },
        staleTime: 1000 * 60,
    })
}

export function useTaskByIdQuery(taskId: string | null) {
    return useQuery({
        queryKey: tasksKeys.detail(taskId ?? ''),
        enabled: !!taskId,
        queryFn: async () => {
            if (!taskId) return null
            return request<Task>(`/api/tasks/item/${encodeURIComponent(taskId)}`)
        },
        staleTime: 1000 * 30,
    })
}

export function useUpdateTaskMutation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ taskId, updates }: { taskId: string, updates: Partial<Task> }) => {
            return request<Task>(`/api/tasks/item/${encodeURIComponent(taskId)}`, {
                method: 'PATCH',
                body: JSON.stringify(updates)
            })
        },
        onMutate: async ({ taskId, updates }) => {
            await queryClient.cancelQueries({ queryKey: tasksKeys.detail(taskId) })
            await queryClient.cancelQueries({ queryKey: tasksKeys.list() })

            const previousTask = queryClient.getQueryData<Task>(tasksKeys.detail(taskId))
            const previousList = queryClient.getQueryData<Task[]>(tasksKeys.list())

            if (previousTask) {
                queryClient.setQueryData<Task>(tasksKeys.detail(taskId), { ...previousTask, ...updates })
            }
            if (previousList) {
                queryClient.setQueryData<Task[]>(tasksKeys.list(),
                    previousList.map(t => t.id === taskId ? { ...t, ...updates } : t)
                )
            }

            return { previousTask, previousList }
        },
        onError: (_err, { taskId }, context) => {
            if (context?.previousTask) {
                queryClient.setQueryData(tasksKeys.detail(taskId), context.previousTask)
            }
            if (context?.previousList) {
                queryClient.setQueryData(tasksKeys.list(), context.previousList)
            }
        },
        onSettled: (_data, _error, { taskId }) => {
            queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) })
            queryClient.invalidateQueries({ queryKey: tasksKeys.list() })
        }
    })
}

export function useDeleteTaskMutation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (taskId: string) => {
            await request(`/api/tasks/item/${encodeURIComponent(taskId)}`, {
                method: 'DELETE'
            })
            return taskId
        },
        onMutate: async (taskId) => {
            await queryClient.cancelQueries({ queryKey: tasksKeys.list() })
            const previousList = queryClient.getQueryData<Task[]>(tasksKeys.list())

            if (previousList) {
                queryClient.setQueryData<Task[]>(tasksKeys.list(),
                    previousList.filter(t => t.id !== taskId)
                )
            }

            return { previousList }
        },
        onError: (_err, _taskId, context) => {
            if (context?.previousList) {
                queryClient.setQueryData(tasksKeys.list(), context.previousList)
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: tasksKeys.lists() })
        }
    })
}

export function useTaskQuery(noteId: string, blockId: string) {
    return useQuery({
        queryKey: tasksKeys.task(blockId),
        enabled: !!noteId && !!blockId,
        queryFn: async () => {
            return request<Task | null>(`/api/tasks/${encodeURIComponent(noteId)}?blockId=${encodeURIComponent(blockId)}`)
        }
    })
}

export function useSyncTasksMutation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ noteId, tasks }: { noteId: string, tasks: ExtractedTask[] }) => {
            if (!noteId) return
            await request('/api/tasks/sync', {
                method: 'POST',
                body: JSON.stringify({
                    noteId,
                    tasks
                })
            })
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: tasksKeys.note(variables.noteId) })
        }
    })
}

export function useDeleteTasksMutation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (noteId: string) => {
            if (!noteId) return
            await request(`/api/tasks/${encodeURIComponent(noteId)}`, {
                method: 'DELETE'
            })
        },
        onSuccess: (_, noteId) => {
            queryClient.invalidateQueries({ queryKey: tasksKeys.note(noteId) })
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
