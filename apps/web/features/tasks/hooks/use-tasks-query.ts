import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Task } from '../types'
import type { ExtractedTask } from '@/features/notes/utils/extract-tasks'

export const tasksKeys = {
    all: ['tasks'] as const,
    note: (noteId: string) => [...tasksKeys.all, 'note', noteId] as const,
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
        staleTime: 1000 * 60, // 1 minute
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
