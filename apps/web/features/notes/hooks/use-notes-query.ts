import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { readMany, readOne, create, update, destroy } from '@skriuw/crud'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { useSession } from '@/lib/auth-client'
import { generateId } from '@skriuw/shared'
import type { Item, Note, Folder } from '../types'
import { extractTasksFromBlocks } from '../utils/extract-tasks'
import { trackActivity } from '@/features/activity'

// Type definitions
type NoteContent = any[] // Block[]

// Keys factory for query invalidation
export const notesKeys = {
    all: ['notes'] as const,
    lists: () => [...notesKeys.all, 'list'] as const,
    list: (userId: string | undefined) => [...notesKeys.lists(), { userId }] as const,
    details: () => [...notesKeys.all, 'detail'] as const,
    detail: (id: string) => [...notesKeys.details(), id] as const,
}

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

/**
 * Fetch all items (notes + folders) and filter out soft-deleted ones.
 */
export function useNotesQuery() {
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useQuery({
        queryKey: notesKeys.list(userId),
        queryFn: async () => {
            const result = await readMany<Item>(STORAGE_KEYS.NOTES, {
                userId
            })

            if (!result.success || !result.data) return []

            const allItems = Array.isArray(result.data) ? result.data : []
            return filterActiveItems(allItems)
        },
        staleTime: 60 * 1000,
    })
}

/**
 * Fetch a single item (note or folder)
 */
export function useNoteQuery(id: string) {
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useQuery({
        queryKey: notesKeys.detail(id),
        queryFn: async () => {
            const result = await readOne<Item>(STORAGE_KEYS.NOTES, id, { userId })
            if (result.success && result.data && 'id' in result.data) {
                return result.data
            }
            return null
        },
        enabled: !!id
    })
}


// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

export function useCreateNoteMutation() {
    const queryClient = useQueryClient()
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useMutation({
        mutationFn: async ({ name, content, parentFolderId }: { name: string, content: any[], parentFolderId?: string }) => {
            const newNote: Note = {
                id: generateId('temp-'), // will be overwritten by server/local
                name,
                type: 'note',
                content: content,
                parentFolderId,
                pinned: false,
                favorite: false,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }

            const result = await create<Note>(STORAGE_KEYS.NOTES, newNote, { userId })
            if (!result.success || !result.data) throw new Error('Failed to create note')
            return result.data
        },
        onSuccess: () => {
            // Invalidate list to refetch
            queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
        }
    })
}

export function useCreateFolderMutation() {
    const queryClient = useQueryClient()
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useMutation({
        mutationFn: async ({ name, parentFolderId }: { name: string, parentFolderId?: string }) => {
            const newFolder: Folder = {
                id: generateId('temp-'),
                name,
                type: 'folder',
                children: [],
                parentFolderId,
                pinned: false,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }

            const result = await create<Folder>(STORAGE_KEYS.NOTES, newFolder, { userId })
            if (!result.success || !result.data) throw new Error('Failed to create folder')
            return result.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
        }
    })
}

export function useUpdateNoteMutation() {
    const queryClient = useQueryClient()
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useMutation({
        mutationFn: async ({ id, content, name }: { id: string, content?: any[], name?: string }) => {
            const result = await update<Note>(STORAGE_KEYS.NOTES, id, { content, name }, { userId })
            if (!result.success) throw new Error('Failed to update note')

            // Sync tasks if content was updated (parity with update-note.ts)
            if (content && Array.isArray(content)) {
                try {
                    const extractedTasks = extractTasksFromBlocks(content, id)
                    // Fire and forget - call /api/tasks/sync
                    fetch('/api/tasks/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ noteId: id, tasks: extractedTasks })
                    }).catch(() => { })
                } catch (taskError) {
                    // Don't fail note update if task sync fails
                    console.error('Failed to sync tasks:', taskError)
                }
            }

            // Track activity (fire-and-forget via server action)
            if (result.data) {
                trackActivity({
                    entityType: 'note',
                    entityId: id,
                    action: 'updated',
                    entityName: result.data.name || 'Untitled'
                })
            }

            return result.data
        },
        onMutate: async (newNote) => {
            await queryClient.cancelQueries({ queryKey: notesKeys.list(userId) })
            const previousNotes = queryClient.getQueryData(notesKeys.list(userId))

            queryClient.setQueryData(notesKeys.list(userId), (old: Item[] = []) => {
                const updateItem = (items: Item[]): Item[] => {
                    return items.map(item => {
                        if (item.id === newNote.id) {
                            return { ...item, ...newNote, updatedAt: Date.now() }
                        }
                        if (item.type === 'folder') {
                            return { ...item, children: updateItem(item.children) }
                        }
                        return item
                    })
                }
                return updateItem(old)
            })

            return { previousNotes }
        },
        onError: (err, newNote, context) => {
            queryClient.setQueryData(notesKeys.list(userId), context?.previousNotes)
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
        }
    })
}


export function useDeleteMutation() {
    const queryClient = useQueryClient()
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useMutation({
        mutationFn: async (id: string) => {
            const result = await destroy(STORAGE_KEYS.NOTES, id, { userId })
            if (!result.success) throw new Error('Failed to delete item')
            return true
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: notesKeys.list(userId) })
            const previousNotes = queryClient.getQueryData(notesKeys.list(userId))

            queryClient.setQueryData(notesKeys.list(userId), (old: Item[] = []) => {
                const removeItem = (items: Item[]): Item[] => {
                    return items.filter(item => item.id !== id).map(item => {
                        if (item.type === 'folder') {
                            return { ...item, children: removeItem(item.children) }
                        }
                        return item
                    })
                }
                return removeItem(old)
            })

            return { previousNotes }
        },
        onError: (err, id, context) => {
            queryClient.setQueryData(notesKeys.list(userId), context?.previousNotes)
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
        }
    })
}

export function useMoveItemMutation() {
    const queryClient = useQueryClient()
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useMutation({
        mutationFn: async ({ itemId, targetFolderId }: { itemId: string, targetFolderId: string | null }) => {
            const updateData = { parentFolderId: targetFolderId === null ? undefined : targetFolderId } as Partial<Item>
            const result = await update<Item>(STORAGE_KEYS.NOTES, itemId, updateData, { userId })
            if (!result.success) throw new Error('Failed to move item')
            return result.data
        },
        async onMutate({ itemId, targetFolderId }) {
            await queryClient.cancelQueries({ queryKey: notesKeys.list(userId) })
            const previousNotes = queryClient.getQueryData<Item[]>(notesKeys.list(userId))

            queryClient.setQueryData<Item[] | undefined>(notesKeys.list(userId), (old) => {
                if (!old) return old

                const nextParentId = targetFolderId === null ? undefined : targetFolderId
                return old.map((item) =>
                    item.id === itemId
                        ? { ...item, parentFolderId: nextParentId }
                        : item
                )
            })

            return { previousNotes }
        },
        onError: (_err, _variables, context) => {
            if (context?.previousNotes) {
                queryClient.setQueryData(notesKeys.list(userId), context.previousNotes)
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
        }
    })
}

export function useRenameItemMutation() {
    const queryClient = useQueryClient()
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useMutation({
        mutationFn: async ({ id, name }: { id: string, name: string }) => {
            const result = await update<Item>(STORAGE_KEYS.NOTES, id, { name }, { userId })
            if (!result.success) throw new Error('Failed to rename item')
            return result.data
        },
        onMutate: async ({ id, name }) => {
            await queryClient.cancelQueries({ queryKey: notesKeys.list(userId) })
            const previousNotes = queryClient.getQueryData(notesKeys.list(userId))

            queryClient.setQueryData(notesKeys.list(userId), (old: Item[] = []) => {
                const rename = (items: Item[]): Item[] => {
                    return items.map(item => {
                        if (item.id === id) return { ...item, name }
                        if (item.type === 'folder') return { ...item, children: rename(item.children) }
                        return item
                    })
                }
                return rename(old)
            })
            return { previousNotes }
        },
        onError: (err, vars, context) => {
            queryClient.setQueryData(notesKeys.list(userId), context?.previousNotes)
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
        }
    })
}

export function usePinItemMutation() {
    const queryClient = useQueryClient()
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useMutation({
        mutationFn: async ({ id, pinned }: { id: string, pinned: boolean }) => {
            const result = await update<Item>(STORAGE_KEYS.NOTES, id, { pinned, pinnedAt: pinned ? Date.now() : undefined }, { userId })
            if (!result.success) throw new Error('Failed to pin item')
            return result.data
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
        }
    })
}

export function useFavoriteNoteMutation() {
    const queryClient = useQueryClient()
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useMutation({
        mutationFn: async ({ id, favorite }: { id: string, favorite: boolean }) => {
            const result = await update<Note>(STORAGE_KEYS.NOTES, id, { favorite }, { userId })
            if (!result.success) throw new Error('Failed to favorite note')
            return result.data
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
        }
    })
}

export function useSetNoteVisibilityMutation() {
    const queryClient = useQueryClient()
    const { data: session } = useSession()
    const userId = session?.user?.id ?? 'guest'

    return useMutation({
        mutationFn: async ({ id, isPublic }: { id: string, isPublic: boolean }) => {
            const response = await fetch('/api/notes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, isPublic })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to set visibility')
            }

            return await response.json() as Note
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
        }
    })
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Filter out deleted items recursively
 */
function filterActiveItems(items: Item[]): Item[] {
    return items
        .filter((item) => !item.deletedAt)
        .map((item) => {
            if (item.type === 'folder') {
                return { ...item, children: filterActiveItems(item.children) }
            }
            return item
        })
}
